import { config } from '../config/env.js';
import { getTokensCollection } from '../db/models/Token.js';
import { getTradesCollection } from '../db/models/Trade.js';
import type { WebSocketService } from './WebSocketService.js';
import type { OptimisticStateService } from './OptimisticStateService.js';
import { decodeBuyEvent, decodeSellEvent } from './EventDecoder.js';
import { toDisplayPrice } from '../utils/price.js';
import { getPlatformStatsCollection } from '../db/models/PlatformStats.js';
import type { PendingTransaction } from '../types/contracts.js';

export class MempoolService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private knownPendingTxs = new Set<string>();
  private provider: import('opnet').JSONRpcProvider | null = null;
  private processing = false;

  constructor(
    private wsService: WebSocketService,
    private optimisticService: OptimisticStateService,
  ) {}

  private async getProvider(): Promise<import('opnet').JSONRpcProvider> {
    if (!this.provider) {
      const { JSONRpcProvider } = await import('opnet');
      const { networks } = await import('@btc-vision/bitcoin');
      const network = config.network === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
      this.provider = new JSONRpcProvider({ url: config.opnetRpcUrl, network });
    }
    return this.provider;
  }

  /**
   * Start polling the mempool for pending transactions.
   */
  start(): void {
    console.log(`[Mempool] Starting with ${config.mempoolPollMs}ms interval`);

    this.interval = setInterval(() => {
      this.poll().catch((err) => {
        console.error('[Mempool] Poll error:', err.message);
      });
    }, config.mempoolPollMs);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      await this.scanMempool();
      await this.detectDropped();
      this.optimisticService.cleanup();
    } catch (err) {
      console.error('[Mempool] Error:', err instanceof Error ? err.message : err);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Scan the OPNet mempool for pending Buy/Sell transactions targeting known tokens.
   */
  private async scanMempool(): Promise<void> {
    const provider = await this.getProvider();

    let pendingTxs: PendingTransaction[];
    try {
      pendingTxs = await (provider as unknown as { getLatestPendingTransactions: () => Promise<PendingTransaction[]> }).getLatestPendingTransactions();
    } catch (err) {
      // RPC may not support this yet on all networks — degrade gracefully
      console.debug('[Mempool] getLatestPendingTransactions unavailable:', err instanceof Error ? err.message : err);
      return;
    }

    if (!pendingTxs || pendingTxs.length === 0) return;

    // Build known token set
    const tokens = getTokensCollection();
    const knownTokens = await tokens.find({}, { projection: { _id: 1 } }).toArray();
    const tokenAddressSet = new Set(knownTokens.map((t) => t._id));

    const { OPNetTransactionTypes } = await import('opnet');

    for (const tx of pendingTxs) {
      const txHash = tx.hash;
      if (!txHash) continue;

      // Skip already-known pending txs
      if (this.knownPendingTxs.has(txHash)) continue;

      // Only interaction transactions (contract calls)
      if (tx.OPNetType !== OPNetTransactionTypes.Interaction) continue;

      const contractAddr = tx.contractAddress;
      if (!contractAddr || !tokenAddressSet.has(contractAddr)) continue;

      // Check if this tx was already confirmed (race between indexer and mempool)
      const trades = getTradesCollection();
      const existing = await trades.findOne({ _id: txHash });
      if (existing) continue;

      // Parse events from the pending transaction's simulated receipt
      const events = tx.events as Record<string, unknown[]> | undefined;
      if (!events) continue;

      const contractEvents = events[contractAddr];
      if (!contractEvents || contractEvents.length === 0) continue;

      // Derive sender address from tx
      const senderAddr = this.extractSenderAddress(tx);

      for (const event of contractEvents) {
        const eventType = (event as { type?: string }).type;
        if (!eventType) continue;

        try {
          if (eventType === 'Buy') {
            const buyData = decodeBuyEvent(event);
            if (buyData) {
              await this.registerPendingTrade(
                txHash,
                contractAddr,
                'buy',
                buyData.buyer || senderAddr,
                buyData.btcIn.toString(),
                buyData.tokensOut.toString(),
                buyData.newPrice.toString(),
              );
            }
          } else if (eventType === 'Sell') {
            const sellData = decodeSellEvent(event);
            if (sellData) {
              await this.registerPendingTrade(
                txHash,
                contractAddr,
                'sell',
                sellData.seller || senderAddr,
                sellData.btcOut.toString(),
                sellData.tokensIn.toString(),
                sellData.newPrice.toString(),
              );
            }
          }
        } catch (err) {
          console.error(`[Mempool] Error processing pending ${eventType} in tx ${txHash}:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }

  /**
   * Extract sender address from a transaction object.
   */
  private extractSenderAddress(tx: PendingTransaction): string {
    // The tx.from field is an Address object with toHex()
    const from = (tx as unknown as { from?: { toHex?: () => string } }).from;
    if (from && typeof from.toHex === 'function') {
      return from.toHex();
    }
    return 'unknown';
  }

  /**
   * Detect transactions that were pending but are now gone from the mempool.
   * Cross-references known pending txs against the RPC to detect drops/RBF.
   */
  private async detectDropped(): Promise<void> {
    const trades = getTradesCollection();

    // Time-based cleanup: find pending trades older than 30 minutes
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const stale = await trades
      .find({ status: 'pending', createdAt: { $lt: cutoff } })
      .toArray();

    for (const trade of stale) {
      await this.dropTrade(trade._id, trade.tokenAddress, 'timeout');
    }

    // RPC-based cleanup: verify known pending txs still exist in the mempool
    if (this.knownPendingTxs.size === 0) return;

    const provider = await this.getProvider();
    const toCheck = [...this.knownPendingTxs];

    for (const txHash of toCheck) {
      try {
        const pendingTx = await (provider as unknown as { getPendingTransaction: (hash: string) => Promise<unknown | null> }).getPendingTransaction(txHash);

        if (!pendingTx) {
          // Transaction is no longer in the mempool — it was either confirmed or dropped.
          // If confirmed, the IndexerService will handle it. If dropped, clean up.
          const trade = await trades.findOne({ _id: txHash, status: 'pending' });
          if (trade) {
            // Check if it was confirmed by the indexer in the meantime
            const confirmedTrade = await trades.findOne({ _id: txHash, status: 'confirmed' });
            if (!confirmedTrade) {
              await this.dropTrade(txHash, trade.tokenAddress, 'dropped');
            } else {
              // Already confirmed, just clean up our tracking
              this.knownPendingTxs.delete(txHash);
            }
          } else {
            // No longer in our DB (already confirmed/removed), just clean up tracking
            this.knownPendingTxs.delete(txHash);
          }
        }
      } catch {
        // getPendingTransaction may throw if not supported — skip RPC-based detection
        break;
      }
    }
  }

  /**
   * Remove a dropped/stale pending trade from DB and broadcast the drop event.
   */
  private async dropTrade(txHash: string, tokenAddress: string, reason: string): Promise<void> {
    this.optimisticService.removePendingTrade(tokenAddress, txHash);
    this.knownPendingTxs.delete(txHash);

    this.wsService.broadcast(`token:trades:${tokenAddress}`, 'trade_dropped', {
      txHash,
      reason,
    });

    const trades = getTradesCollection();
    const droppedTrade = await trades.findOne({ _id: txHash, status: 'pending' });
    await trades.deleteOne({ _id: txHash, status: 'pending' });

    // Reverse the stat increments from registerPendingTrade
    if (droppedTrade) {
      try {
        const btcNum = parseInt(droppedTrade.btcAmount, 10) || 0;
        const tokens = getTokensCollection();
        await tokens.updateOne(
          { _id: tokenAddress },
          { $inc: { tradeCount: -1 }, $set: { updatedAt: new Date() } },
        );

        const platformStats = getPlatformStatsCollection();
        await platformStats.updateOne(
          { _id: 'current' },
          { $inc: { totalTrades: -1, totalVolumeSats: -btcNum } as Record<string, number> },
        );
      } catch (err) {
        console.error('[Mempool] Failed to reverse stats for dropped trade:', err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Register a new pending transaction.
   */
  async registerPendingTrade(
    txHash: string,
    tokenAddress: string,
    type: 'buy' | 'sell',
    traderAddress: string,
    btcAmount: string,
    tokenAmount: string,
    pricePerToken: string,
  ): Promise<void> {
    if (this.knownPendingTxs.has(txHash)) return;
    this.knownPendingTxs.add(txHash);

    const trades = getTradesCollection();
    await trades.insertOne({
      _id: txHash,
      tokenAddress,
      type,
      traderAddress,
      btcAmount,
      tokenAmount,
      pricePerToken,
      fees: { platform: '0', creator: '0', minter: '0', flywheel: '0' },
      priceImpactBps: 0,
      status: 'pending',
      createdAt: new Date(),
    });

    // Add to optimistic state
    let amount: bigint;
    try {
      amount = type === 'buy' ? BigInt(btcAmount) : BigInt(tokenAmount);
    } catch {
      console.error('[Mempool] Invalid amount for pending trade:', txHash);
      return;
    }
    this.optimisticService.addPendingTrade(tokenAddress, txHash, type, amount);

    // Broadcast new trade
    this.wsService.broadcast(`token:trades:${tokenAddress}`, 'new_trade', {
      txHash,
      type,
      traderAddress,
      btcAmount,
      tokenAmount,
      status: 'pending',
      pricePerToken,
    });

    // Broadcast optimistic price update
    const optimistic = this.optimisticService.getOptimisticPrice(tokenAddress);
    const displayPrice = toDisplayPrice(
      optimistic.reserves.virtualBtcReserve,
      optimistic.reserves.virtualTokenSupply,
    );
    this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
      currentPriceSats: displayPrice,
      virtualBtcReserve: optimistic.reserves.virtualBtcReserve.toString(),
      virtualTokenSupply: optimistic.reserves.virtualTokenSupply.toString(),
      realBtcReserve: optimistic.reserves.realBtcReserve.toString(),
      isOptimistic: optimistic.isOptimistic,
    });

    // Atomically increment token and platform stats so polls reflect the pending trade
    try {
      const btcNum = parseInt(btcAmount, 10) || 0;
      const tokens = getTokensCollection();
      await tokens.updateOne(
        { _id: tokenAddress },
        { $inc: { tradeCount: 1 }, $set: { updatedAt: new Date() } },
      );

      const platformStats = getPlatformStatsCollection();
      await platformStats.updateOne(
        { _id: 'current' },
        { $inc: { totalTrades: 1, totalVolumeSats: btcNum } as Record<string, number> },
        { upsert: true },
      );
    } catch (err) {
      console.error('[Mempool] Failed to update stats for pending trade:', err instanceof Error ? err.message : err);
    }
  }

}

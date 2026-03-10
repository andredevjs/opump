import { config } from '../config/env.js';
import { getTokensCollection } from '../db/models/Token.js';
import { getTradesCollection } from '../db/models/Trade.js';
import type { WebSocketService } from './WebSocketService.js';
import type { OptimisticStateService } from './OptimisticStateService.js';

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

    let pendingTxs: Array<Record<string, unknown>>;
    try {
      pendingTxs = await (provider as unknown as { getLatestPendingTransactions: () => Promise<Array<Record<string, unknown>>> }).getLatestPendingTransactions();
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
      const txHash = tx.hash as string | undefined;
      if (!txHash) continue;

      // Skip already-known pending txs
      if (this.knownPendingTxs.has(txHash)) continue;

      // Only interaction transactions (contract calls)
      if (tx.OPNetType !== OPNetTransactionTypes.Interaction) continue;

      const contractAddr = tx.contractAddress as string | undefined;
      if (!contractAddr || !tokenAddressSet.has(contractAddr)) continue;

      // Check if this tx was already confirmed (race between indexer and mempool)
      const trades = getTradesCollection();
      const existing = await trades.findOne({ _id: txHash });
      if (existing) continue;

      // Parse events from the pending transaction's simulated receipt
      const events = tx.events as Record<string, Array<Record<string, unknown>>> | undefined;
      if (!events) continue;

      const contractEvents = events[contractAddr];
      if (!contractEvents || contractEvents.length === 0) continue;

      // Derive sender address from tx
      const senderAddr = this.extractSenderAddress(tx);

      for (const event of contractEvents) {
        const eventType = event.type as string | undefined;
        if (!eventType) continue;

        try {
          if (eventType === 'Buy') {
            const buyData = this.decodeBuyEvent(event);
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
            const sellData = this.decodeSellEvent(event);
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
  private extractSenderAddress(tx: Record<string, unknown>): string {
    // The tx.from field is an Address object with toHex()
    const from = tx.from as { toHex?: () => string } | undefined;
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
    await trades.deleteOne({ _id: txHash, status: 'pending' });
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
    const vToken = optimistic.reserves.virtualTokenSupply;
    const price = vToken > 0n ? optimistic.reserves.virtualBtcReserve / vToken : 0n;
    this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
      currentPriceSats: price.toString(),
      virtualBtcReserve: optimistic.reserves.virtualBtcReserve.toString(),
      virtualTokenSupply: optimistic.reserves.virtualTokenSupply.toString(),
      realBtcReserve: optimistic.reserves.realBtcReserve.toString(),
      isOptimistic: optimistic.isOptimistic,
    });
  }

  // --- Event decoding (mirrors IndexerService helpers) ---

  private decodeBuyEvent(event: Record<string, unknown>): { buyer: string; btcIn: bigint; tokensOut: bigint; newPrice: bigint } | null {
    const data = this.getEventData(event);
    if (!data || data.length < 128) return null;
    return {
      buyer: this.readAddressHex(data, 0),
      btcIn: this.readU256(data, 32),
      tokensOut: this.readU256(data, 64),
      newPrice: this.readU256(data, 96),
    };
  }

  private decodeSellEvent(event: Record<string, unknown>): { seller: string; tokensIn: bigint; btcOut: bigint; newPrice: bigint } | null {
    const data = this.getEventData(event);
    if (!data || data.length < 128) return null;
    return {
      seller: this.readAddressHex(data, 0),
      tokensIn: this.readU256(data, 32),
      btcOut: this.readU256(data, 64),
      newPrice: this.readU256(data, 96),
    };
  }

  private getEventData(event: Record<string, unknown>): Uint8Array | null {
    if (event.data instanceof Uint8Array) return event.data;
    if (typeof event.data === 'string') {
      const hex = event.data.startsWith('0x') ? event.data.slice(2) : event.data;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    return null;
  }

  private readU256(data: Uint8Array, offset: number): bigint {
    let value = 0n;
    for (let i = 0; i < 32; i++) {
      value = (value << 8n) | BigInt(data[offset + i]);
    }
    return value;
  }

  private readAddressHex(data: Uint8Array, offset: number): string {
    const bytes = data.slice(offset, offset + 32);
    let hex = '0x';
    for (const b of bytes) {
      hex += b.toString(16).padStart(2, '0');
    }
    return hex;
  }
}

import { config } from '../config/env.js';
import { getTokensCollection } from '../db/models/Token.js';
import { getTradesCollection } from '../db/models/Trade.js';
import { getPlatformStatsCollection } from '../db/models/PlatformStats.js';
import type { WebSocketService } from './WebSocketService.js';
import type { OptimisticStateService } from './OptimisticStateService.js';
import type { MigrationService } from './MigrationService.js';
import {
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  FEE_DENOMINATOR,
} from '../../../shared/constants/bonding-curve.js';
import { toDisplayPrice, scaledToDisplayPrice } from '../utils/price.js';
import type { LaunchTokenContract, InteractionTransaction } from '../types/contracts.js';
import {
  decodeBuyEvent,
  decodeSellEvent,
  decodeGraduationEvent,
  decodeMigrationEvent,
  decodeTokenDeployedEvent,
} from './EventDecoder.js';
import type {
  BuyEventData,
  SellEventData,
} from './EventDecoder.js';
export type {
  BuyEventData,
  SellEventData,
  GraduationEventData,
  MigrationEventData,
  TokenDeployedEventData,
} from './EventDecoder.js';

// toDisplayPrice and scaledToDisplayPrice imported from utils/price.ts

import type { BroadcastDebouncer } from './BroadcastDebouncer.js';

export class IndexerService {
  private lastBlockIndexed = 0n;
  private interval: ReturnType<typeof setInterval> | null = null;
  private reserveSyncInterval: ReturnType<typeof setInterval> | null = null;
  private provider: import('opnet').JSONRpcProvider | null = null;
  private processing = false;
  private syncingReserves = false;

  private migrationService: MigrationService | null = null;

  constructor(
    private wsService: WebSocketService,
    private optimisticService: OptimisticStateService,
    private debouncer: BroadcastDebouncer,
  ) {}

  setMigrationService(service: MigrationService): void {
    this.migrationService = service;
  }

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
   * Start polling for new blocks.
   */
  async start(): Promise<void> {
    // Load last indexed block from DB
    const stats = await getPlatformStatsCollection().findOne({ _id: 'current' });
    if (stats) {
      this.lastBlockIndexed = BigInt(stats.lastBlockIndexed);
    }

    console.log(`[Indexer] Starting from block ${this.lastBlockIndexed}`);

    // One-time backfill: rename graduatedAtBlock → graduatedAt
    const tokens = getTokensCollection();
    await tokens.updateMany(
      { graduatedAtBlock: { $exists: true }, graduatedAt: { $exists: false } } as Record<string, unknown>,
      [{ $set: { graduatedAt: '$graduatedAtBlock' } }] as unknown as Record<string, unknown>,
    );
    await tokens.updateMany(
      { graduatedAtBlock: { $exists: true } } as Record<string, unknown>,
      { $unset: { graduatedAtBlock: '' } } as Record<string, unknown>,
    );

    this.interval = setInterval(() => {
      this.poll().catch((err) => {
        console.error('[Indexer] Poll error:', err.message);
      });
    }, config.indexerPollMs);

    // Periodic full reserve sync — catches direct on-chain interactions missed by event parsing
    this.reserveSyncInterval = setInterval(() => {
      this.syncAllActiveReserves().catch((err) => {
        console.error('[Indexer] Reserve sync error:', err instanceof Error ? err.message : err);
      });
    }, config.reserveSyncIntervalMs);

    console.log(`[Indexer] Reserve sync every ${config.reserveSyncIntervalMs}ms`);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.reserveSyncInterval) {
      clearInterval(this.reserveSyncInterval);
      this.reserveSyncInterval = null;
    }
  }

  private async poll(): Promise<void> {
    // Prevent overlapping polls
    if (this.processing) return;
    this.processing = true;

    try {
      const provider = await this.getProvider();
      const currentBlock = await provider.getBlockNumber();

      if (currentBlock <= this.lastBlockIndexed) return;

      for (let blockNum = this.lastBlockIndexed + 1n; blockNum <= currentBlock; blockNum++) {
        await this.processBlock(Number(blockNum));
      }

      this.lastBlockIndexed = currentBlock;
      await this.updateStats(Number(currentBlock));
    } catch (err) {
      console.error('[Indexer] Error:', err instanceof Error ? err.message : err);
    } finally {
      this.processing = false;
    }
  }

  /**
   * Process a confirmed block — fetch transactions, parse events, update state.
   */
  async processBlock(blockNumber: number): Promise<void> {
    const provider = await this.getProvider();
    const trades = getTradesCollection();
    const tokens = getTokensCollection();

    // 1) Fetch the block with prefetched transactions
    let block;
    try {
      block = await provider.getBlock(blockNumber, true);
    } catch (err) {
      console.error(`[Indexer] Failed to fetch block ${blockNumber}:`, err instanceof Error ? err.message : err);
      return;
    }

    if (!block || !block.transactions || block.transactions.length === 0) {
      this.broadcastBlock(blockNumber);
      this.optimisticService.cleanup();
      await this.updateStats(blockNumber);
      return;
    }

    // 3) Build a set of known token addresses for quick lookup
    const knownTokens = await tokens.find({}, { projection: { _id: 1 } }).toArray();
    const tokenAddressSet = new Set(knownTokens.map((t) => t._id));

    // 4) Process each transaction in the block
    const { OPNetTransactionTypes } = await import('opnet');
    const affectedTokens = new Set<string>();

    for (const tx of block.transactions) {
      // Only process interaction transactions (contract calls)
      if (tx.OPNetType !== OPNetTransactionTypes.Interaction) {
        // Check deployment transactions for factory-emitted TokenDeployed events
        if (tx.OPNetType === OPNetTransactionTypes.Deployment) {
          await this.processDeploymentTx(tx, blockNumber);
        }
        continue;
      }

      const interactionTx = tx as unknown as InteractionTransaction;
      const contractAddr = interactionTx.contractAddress;

      if (!contractAddr) continue;

      // Check if this is a known token or the factory contract
      const isKnownToken = tokenAddressSet.has(contractAddr);
      const isFactory = config.factoryAddress && contractAddr === config.factoryAddress;

      if (!isKnownToken && !isFactory) continue;

      // Parse events from the transaction receipt embedded in the tx
      const events = tx.events;
      if (!events) continue;

      const contractEvents = events[contractAddr];
      if (!contractEvents || contractEvents.length === 0) continue;

      for (const event of contractEvents) {
        const eventType = (event as { type?: string }).type;
        if (!eventType) continue;

        try {
          if (eventType === 'Buy' && isKnownToken) {
            const buyData = decodeBuyEvent(event);
            if (buyData) {
              await this.processBuyEvent(contractAddr, tx.hash, blockNumber, block.time, buyData);
              affectedTokens.add(contractAddr);
            }
          } else if (eventType === 'Sell' && isKnownToken) {
            const sellData = decodeSellEvent(event);
            if (sellData) {
              await this.processSellEvent(contractAddr, tx.hash, blockNumber, block.time, sellData);
              affectedTokens.add(contractAddr);
            }
          } else if (eventType === 'Graduation' && isKnownToken) {
            const gradData = decodeGraduationEvent(event);
            if (gradData) {
              await this.processGraduation(contractAddr, blockNumber);
              affectedTokens.add(contractAddr);
            }
          } else if (eventType === 'Migration' && isKnownToken) {
            const migrationData = decodeMigrationEvent(event);
            if (migrationData) {
              console.log(`[Indexer] Migration event for ${contractAddr}: ${migrationData.tokenAmount} tokens to ${migrationData.recipient}`);
            }
          } else if (eventType === 'TokenDeployed' && isFactory) {
            const deployData = decodeTokenDeployedEvent(event);
            if (deployData) {
              tokenAddressSet.add(deployData.tokenAddress);
              console.log(`[Indexer] Discovered new token ${deployData.tokenAddress} from factory at block ${blockNumber}`);
            }
          }
        } catch (err) {
          console.error(`[Indexer] Error processing ${eventType} event in tx ${tx.hash}:`, err instanceof Error ? err.message : err);
        }
      }
    }

    // 5) Update on-chain reserves for affected tokens
    for (const tokenAddr of affectedTokens) {
      await this.syncTokenReserves(tokenAddr);
    }

    // 6) Update per-token stats for affected tokens
    if (affectedTokens.size > 0) {
      const affectedTrades = await trades
        .find({ tokenAddress: { $in: [...affectedTokens] }, status: 'confirmed', blockNumber })
        .toArray();
      if (affectedTrades.length > 0) {
        await this.updateTokenStats(affectedTrades);
      }
    }

    this.broadcastBlock(blockNumber);
    this.optimisticService.cleanup();
    await this.updateStats(blockNumber);
  }

  /**
   * Process a Buy event: upsert trade record and broadcast.
   */
  private async processBuyEvent(
    tokenAddress: string,
    txHash: string,
    blockNumber: number,
    blockTime: number,
    data: BuyEventData,
  ): Promise<void> {
    const trades = getTradesCollection();

    // Calculate fees using the simulator
    const fees = this.calculateFeeBreakdown(data.btcIn);

    // Use the on-chain newPrice from the event — DB reserves may be stale
    const displayPrice = scaledToDisplayPrice(data.newPrice);

    // Upsert — if the MempoolService already registered this trade as pending, update it
    await trades.updateOne(
      { _id: txHash },
      {
        $set: {
          tokenAddress,
          type: 'buy' as const,
          traderAddress: data.buyer,
          btcAmount: data.btcIn.toString(),
          tokenAmount: data.tokensOut.toString(),
          pricePerToken: displayPrice,
          fees: {
            platform: fees.platform.toString(),
            creator: fees.creator.toString(),
            minter: fees.minter.toString(),
            flywheel: '0',
          },
          priceImpactBps: 0, // Could be calculated from before/after price
          status: 'confirmed' as const,
          blockNumber,
          blockTimestamp: new Date(blockTime * 1000),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    // Remove from optimistic state
    this.optimisticService.removePendingTrade(tokenAddress, txHash);

    // Update token document price immediately so API endpoints return fresh data
    await getTokensCollection().updateOne(
      { _id: tokenAddress },
      { $set: { currentPriceSats: displayPrice, updatedAt: new Date() } },
    );

    // Broadcast trade
    this.wsService.broadcast(`token:trades:${tokenAddress}`, 'new_trade', {
      txHash,
      type: 'buy',
      traderAddress: data.buyer,
      btcAmount: data.btcIn.toString(),
      tokenAmount: data.tokensOut.toString(),
      pricePerToken: displayPrice,
      status: 'confirmed',
      blockNumber,
    });

    // Sync reserves from chain, then broadcast price_update with full reserve data
    this.syncTokenReserves(tokenAddress)
      .then(async () => {
        const updatedToken = await getTokensCollection().findOne({ _id: tokenAddress });
        this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
          currentPriceSats: displayPrice,
          virtualBtcReserve: updatedToken?.virtualBtcReserve ?? '0',
          virtualTokenSupply: updatedToken?.virtualTokenSupply ?? '0',
          realBtcReserve: updatedToken?.realBtcReserve ?? '0',
          isOptimistic: false,
        });
      })
      .catch((err) => {
        // Fallback: broadcast without reserves if sync fails
        console.debug('[Indexer] Post-trade reserve sync failed:', err instanceof Error ? err.message : err);
        this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
          currentPriceSats: displayPrice,
          isOptimistic: false,
        });
      });
  }

  /**
   * Process a Sell event: upsert trade record and broadcast.
   */
  private async processSellEvent(
    tokenAddress: string,
    txHash: string,
    blockNumber: number,
    blockTime: number,
    data: SellEventData,
  ): Promise<void> {
    const trades = getTradesCollection();
    const fees = this.calculateFeeBreakdown(data.btcOut);

    // Use the on-chain newPrice from the event — DB reserves may be stale
    const sellDisplayPrice = scaledToDisplayPrice(data.newPrice);

    await trades.updateOne(
      { _id: txHash },
      {
        $set: {
          tokenAddress,
          type: 'sell' as const,
          traderAddress: data.seller,
          btcAmount: data.btcOut.toString(),
          tokenAmount: data.tokensIn.toString(),
          pricePerToken: sellDisplayPrice,
          fees: {
            platform: fees.platform.toString(),
            creator: fees.creator.toString(),
            minter: fees.minter.toString(),
            flywheel: '0',
          },
          priceImpactBps: 0,
          status: 'confirmed' as const,
          blockNumber,
          blockTimestamp: new Date(blockTime * 1000),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    this.optimisticService.removePendingTrade(tokenAddress, txHash);

    // Update token document price immediately so API endpoints return fresh data
    await getTokensCollection().updateOne(
      { _id: tokenAddress },
      { $set: { currentPriceSats: sellDisplayPrice, updatedAt: new Date() } },
    );

    this.wsService.broadcast(`token:trades:${tokenAddress}`, 'new_trade', {
      txHash,
      type: 'sell',
      traderAddress: data.seller,
      btcAmount: data.btcOut.toString(),
      tokenAmount: data.tokensIn.toString(),
      pricePerToken: sellDisplayPrice,
      status: 'confirmed',
      blockNumber,
    });

    // Sync reserves from chain, then broadcast price_update with full reserve data
    this.syncTokenReserves(tokenAddress)
      .then(async () => {
        const updatedToken = await getTokensCollection().findOne({ _id: tokenAddress });
        this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
          currentPriceSats: sellDisplayPrice,
          virtualBtcReserve: updatedToken?.virtualBtcReserve ?? '0',
          virtualTokenSupply: updatedToken?.virtualTokenSupply ?? '0',
          realBtcReserve: updatedToken?.realBtcReserve ?? '0',
          isOptimistic: false,
        });
      })
      .catch((err) => {
        console.debug('[Indexer] Post-trade reserve sync failed:', err instanceof Error ? err.message : err);
        this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
          currentPriceSats: sellDisplayPrice,
          isOptimistic: false,
        });
      });
  }

  /**
   * Calculate fee breakdown from a BTC amount using shared constants.
   */
  private calculateFeeBreakdown(amount: bigint): { platform: bigint; creator: bigint; minter: bigint } {
    return {
      platform: (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR,
      creator: (amount * CREATOR_FEE_BPS) / FEE_DENOMINATOR,
      minter: (amount * MINTER_FEE_BPS) / FEE_DENOMINATOR,
    };
  }

  /**
   * Periodically sync reserves for ALL active tokens from on-chain state.
   * Catches direct contract interactions that bypass the app.
   */
  private async syncAllActiveReserves(): Promise<void> {
    if (this.syncingReserves) return;
    this.syncingReserves = true;

    try {
      const tokens = getTokensCollection();
      const activeTokens = await tokens
        .find({ status: 'active' }, { projection: { _id: 1 } })
        .toArray();

      if (activeTokens.length === 0) return;

      console.log(`[Indexer] Syncing reserves for ${activeTokens.length} active tokens`);

      // Process sequentially to avoid overwhelming the RPC
      for (const token of activeTokens) {
        await this.syncTokenReserves(token._id);
      }
    } catch (err) {
      console.error('[Indexer] Full reserve sync failed:', err instanceof Error ? err.message : err);
    } finally {
      this.syncingReserves = false;
    }
  }

  /**
   * Sync token reserves from on-chain state via RPC call.
   */
  private async syncTokenReserves(tokenAddress: string): Promise<void> {
    try {
      const provider = await this.getProvider();
      const { getContract, ABIDataTypes, BitcoinAbiTypes } = await import('opnet');
      const { networks } = await import('@btc-vision/bitcoin');
      const network = config.network === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;

      // Build a minimal ABI for getReserves view call
      const abi: import('opnet').BitcoinInterfaceAbi = [
        {
          name: 'getReserves',
          type: BitcoinAbiTypes.Function,
          constant: true,
          inputs: [],
          outputs: [
            { name: 'virtualBtc', type: ABIDataTypes.UINT256 },
            { name: 'virtualToken', type: ABIDataTypes.UINT256 },
            { name: 'realBtc', type: ABIDataTypes.UINT256 },
            { name: 'k', type: ABIDataTypes.UINT256 },
          ],
        },
      ];

      const contract = getContract(tokenAddress, abi, provider, network);
      const result = await (contract as unknown as LaunchTokenContract).getReserves();

      if (result && result.properties) {
        const { virtualBtc, virtualToken, realBtc, k } = result.properties;
        const tokens = getTokensCollection();

        // Read current reserves before updating
        const oldDoc = await tokens.findOne({ _id: tokenAddress });

        await tokens.updateOne(
          { _id: tokenAddress },
          {
            $set: {
              virtualBtcReserve: virtualBtc.toString(),
              virtualTokenSupply: virtualToken.toString(),
              kConstant: k.toString(),
              realBtcReserve: realBtc.toString(),
              currentPriceSats: toDisplayPrice(virtualBtc, virtualToken),
              updatedAt: new Date(),
            },
          },
        );

        // Update optimistic service confirmed reserves
        this.optimisticService.setConfirmedReserves(tokenAddress, {
          virtualBtcReserve: virtualBtc,
          virtualTokenSupply: virtualToken,
          kConstant: k,
          realBtcReserve: realBtc,
        });

        // If any reserve field changed, broadcast authoritative price_update
        const oldVBtc = oldDoc?.virtualBtcReserve ?? '0';
        const oldVToken = oldDoc?.virtualTokenSupply ?? '0';
        const oldRBtc = oldDoc?.realBtcReserve ?? '0';
        if (
          oldVBtc !== virtualBtc.toString() ||
          oldVToken !== virtualToken.toString() ||
          oldRBtc !== realBtc.toString()
        ) {
          this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
            currentPriceSats: toDisplayPrice(virtualBtc, virtualToken),
            virtualBtcReserve: virtualBtc.toString(),
            virtualTokenSupply: virtualToken.toString(),
            realBtcReserve: realBtc.toString(),
            isOptimistic: false,
          });
        }
      }
    } catch (err) {
      console.error(`[Indexer] Failed to sync reserves for ${tokenAddress}:`, err instanceof Error ? err.message : err);
    }
  }

  /**
   * Process a deployment transaction — check for TokenDeployed events from the factory.
   */
  private async processDeploymentTx(tx: { hash: string; events?: Record<string, unknown[]> }, blockNumber: number): Promise<void> {
    if (!config.factoryAddress || !tx.events) return;

    const factoryEvents = tx.events[config.factoryAddress];
    if (!factoryEvents || factoryEvents.length === 0) return;

    for (const event of factoryEvents) {
      const eventType = (event as { type?: string }).type;
      if (eventType === 'TokenDeployed') {
        const deployData = decodeTokenDeployedEvent(event);
        if (deployData) {
          console.log(`[Indexer] Discovered new token ${deployData.tokenAddress} from deployment at block ${blockNumber}`);
        }
      }
    }
  }

  /**
   * Process a graduation event detected in a block.
   */
  async processGraduation(tokenAddress: string, blockNumber: number): Promise<void> {
    const tokens = getTokensCollection();

    await tokens.updateOne(
      { _id: tokenAddress },
      {
        $set: {
          status: 'graduated',
          graduatedAt: blockNumber,
          updatedAt: new Date(),
        },
      },
    );

    this.wsService.broadcast(`token:price:${tokenAddress}`, 'token_graduated', {
      tokenAddress,
      blockNumber,
    });

    this.wsService.broadcast('platform', 'token_graduated', {
      tokenAddress,
      blockNumber,
    });

    console.log(`[Indexer] Token ${tokenAddress} graduated at block ${blockNumber}`);

    // Trigger migration to NativeSwap DEX
    if (this.migrationService) {
      this.migrationService.startMigration(tokenAddress).catch((err) => {
        console.error(`[Indexer] Failed to start migration for ${tokenAddress}:`, err instanceof Error ? err.message : err);
      });
    }
  }

  /**
   * Broadcast new block event.
   */
  private broadcastBlock(blockNumber: number): void {
    this.wsService.broadcast('block', 'new_block', {
      height: blockNumber,
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * Update per-token stats (volume24h, marketCapSats, tradeCount) after confirmed trades.
   */
  private async updateTokenStats(confirmedTrades: Array<{ tokenAddress: string; btcAmount?: string }>): Promise<void> {
    const tokens = getTokensCollection();
    const tradesCol = getTradesCollection();

    // Collect unique token addresses from the confirmed trades
    const tokenAddresses = [...new Set(confirmedTrades.map((t) => String(t.tokenAddress)))];

    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    for (const tokenAddress of tokenAddresses) {
      try {
        // Aggregate 24h volume via MongoDB pipeline ($toDouble is acceptable for volume stats)
        const vol24hAgg = await tradesCol.aggregate<{ _id: null; total: number }>([
          { $match: { tokenAddress, createdAt: { $gte: oneDayAgo } } },
          { $group: { _id: null, total: { $sum: { $toDouble: '$btcAmount' } } } },
        ]).toArray();
        const volume24h = Math.floor(vol24hAgg[0]?.total ?? 0).toString();

        // Total trade count
        const tradeCount = await tradesCol.countDocuments({ tokenAddress });

        // 24h trade count
        const tradeCount24h = await tradesCol.countDocuments({ tokenAddress, createdAt: { $gte: oneDayAgo } });

        // Total volume via MongoDB pipeline
        const volTotalAgg = await tradesCol.aggregate<{ _id: null; total: number }>([
          { $match: { tokenAddress } },
          { $group: { _id: null, total: { $sum: { $toDouble: '$btcAmount' } } } },
        ]).toArray();
        const volumeTotal = Math.floor(volTotalAgg[0]?.total ?? 0).toString();

        // Fetch current token to compute market cap from current price
        const token = await tokens.findOne({ _id: tokenAddress });
        let marketCapSats = '0';
        if (token) {
          const vBtcMc = BigInt(token.virtualBtcReserve || '0');
          const vTokenMc = BigInt(token.virtualTokenSupply || '0');
          if (vTokenMc > 0n) {
            marketCapSats = String(vBtcMc * INITIAL_VIRTUAL_TOKEN_SUPPLY / vTokenMc);
          }
        }

        // Count addresses with net-positive token balance (buys > sells)
        // $toDouble precision loss is acceptable for positive-vs-zero comparison
        const holderAgg = await tradesCol.aggregate([
          { $match: { tokenAddress } },
          { $group: {
            _id: '$traderAddress',
            buyTotal: { $sum: { $cond: [{ $eq: ['$type', 'buy'] }, { $toDouble: '$tokenAmount' }, 0] } },
            sellTotal: { $sum: { $cond: [{ $eq: ['$type', 'sell'] }, { $toDouble: '$tokenAmount' }, 0] } },
          }},
          { $match: { $expr: { $gt: ['$buyTotal', '$sellTotal'] } } },
          { $count: 'count' },
        ]).toArray();
        const holderCount = holderAgg.length > 0 ? Number(holderAgg[0].count) : 0;

        await tokens.updateOne(
          { _id: tokenAddress },
          {
            $set: {
              volume24h,
              volumeTotal,
              tradeCount,
              tradeCount24h,
              holderCount,
              marketCapSats,
              updatedAt: new Date(),
            },
          },
        );

        // Broadcast canonical stats via debouncer (overwrites any mempool approximations)
        this.debouncer.scheduleTokenStats(tokenAddress, {
          volume24h,
          volumeTotal,
          tradeCount,
          tradeCount24h,
          holderCount,
          marketCapSats,
        });

        // Broadcast token activity signal for listing pages
        this.debouncer.tokenActivity(tokenAddress, {
          tokenAddress,
          lastPrice: token?.currentPriceSats ?? '0',
          volume24h,
          btcAmount: '0',
        });
      } catch (err) {
        console.error(`[Indexer] Failed to update stats for ${tokenAddress}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  /**
   * Update platform stats in MongoDB.
   */
  private async updateStats(blockNumber?: number): Promise<void> {
    const stats = getPlatformStatsCollection();
    const tokens = getTokensCollection();

    const totalTokens = await tokens.countDocuments();
    const totalGraduated = await tokens.countDocuments({ status: 'graduated' });
    const tradesCol = getTradesCollection();
    const totalTrades = await tradesCol.countDocuments({});

    // Aggregate total volume via MongoDB pipeline ($toDouble is acceptable for platform-level stats)
    const volAgg = await tradesCol.aggregate<{ _id: null; total: number }>([
      { $match: {} },
      { $group: { _id: null, total: { $sum: { $toDouble: '$btcAmount' } } } },
    ]).toArray();
    const totalVolumeSats = Math.floor(volAgg[0]?.total ?? 0).toString();

    await stats.updateOne(
      { _id: 'current' },
      {
        $set: {
          totalTokens,
          totalGraduated,
          totalTrades,
          totalVolumeSats,
          ...(blockNumber ? { lastBlockIndexed: blockNumber } : {}),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    // Broadcast canonical platform stats via debouncer
    this.debouncer.schedulePlatformStats({
      totalTokens,
      totalTrades,
      totalVolumeSats,
      totalGraduated,
    });
  }
}

import { config } from '../config/env.js';
import { getTokensCollection } from '../db/models/Token.js';
import { getTradesCollection } from '../db/models/Trade.js';
import { getPlatformStatsCollection } from '../db/models/PlatformStats.js';
import type { WebSocketService } from './WebSocketService.js';
import type { OptimisticStateService } from './OptimisticStateService.js';
import { TOKEN_DECIMALS } from '../../../shared/constants/bonding-curve.js';

const DECIMALS_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);

/**
 * Event data layouts emitted by the on-chain contracts.
 * Each field is a 32-byte u256. Addresses are written as u256 (32 bytes).
 */
interface BuyEventData {
  buyer: string;
  btcIn: bigint;
  tokensOut: bigint;
  newPrice: bigint;
}

interface SellEventData {
  seller: string;
  tokensIn: bigint;
  btcOut: bigint;
  newPrice: bigint;
}

interface GraduationEventData {
  triggerer: string;
  finalBtcReserve: bigint;
}

interface TokenDeployedEventData {
  creator: string;
  tokenAddress: string;
}

export class IndexerService {
  private lastBlockIndexed = 0n;
  private interval: ReturnType<typeof setInterval> | null = null;
  private reserveSyncInterval: ReturnType<typeof setInterval> | null = null;
  private provider: import('opnet').JSONRpcProvider | null = null;
  private processing = false;
  private syncingReserves = false;

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
   * Start polling for new blocks.
   */
  async start(): Promise<void> {
    // Load last indexed block from DB
    const stats = await getPlatformStatsCollection().findOne({ _id: 'current' });
    if (stats) {
      this.lastBlockIndexed = BigInt(stats.lastBlockIndexed);
    }

    console.log(`[Indexer] Starting from block ${this.lastBlockIndexed}`);

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

    // 1) Confirm any pre-registered pending trades at this block height
    const pendingResult = await trades.updateMany(
      { status: 'pending', blockNumber },
      { $set: { status: 'confirmed' } },
    );

    if (pendingResult.modifiedCount > 0) {
      const confirmed = await trades.find({ status: 'confirmed', blockNumber }).toArray();
      for (const trade of confirmed) {
        this.optimisticService.removePendingTrade(trade.tokenAddress, trade._id);
        this.wsService.broadcast(`token:trades:${trade.tokenAddress}`, 'trade_confirmed', {
          txHash: trade._id,
          blockNumber,
        });
      }
    }

    // 2) Fetch the block with prefetched transactions
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

      const interactionTx = tx as { contractAddress?: string; hash: string; from?: { p2tr: (network: unknown) => string; toHex: () => string } } & typeof tx;
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
            const buyData = this.decodeBuyEvent(event);
            if (buyData) {
              await this.processBuyEvent(contractAddr, tx.hash, blockNumber, block.time, buyData);
              affectedTokens.add(contractAddr);
            }
          } else if (eventType === 'Sell' && isKnownToken) {
            const sellData = this.decodeSellEvent(event);
            if (sellData) {
              await this.processSellEvent(contractAddr, tx.hash, blockNumber, block.time, sellData);
              affectedTokens.add(contractAddr);
            }
          } else if (eventType === 'Graduation' && isKnownToken) {
            const gradData = this.decodeGraduationEvent(event);
            if (gradData) {
              await this.processGraduation(contractAddr, blockNumber);
              affectedTokens.add(contractAddr);
            }
          } else if (eventType === 'TokenDeployed' && isFactory) {
            const deployData = this.decodeTokenDeployedEvent(event);
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
      // Also update stats for tokens that had pending trades confirmed in step 1
      const pendingConfirmedTokens = pendingResult.modifiedCount > 0
        ? await trades.find({ status: 'confirmed', blockNumber }).toArray()
        : [];
      if (pendingConfirmedTokens.length > 0) {
        await this.updateTokenStats(pendingConfirmedTokens);
      }
    } else if (pendingResult.modifiedCount > 0) {
      const confirmed = await trades.find({ status: 'confirmed', blockNumber }).toArray();
      await this.updateTokenStats(confirmed);
    }

    this.broadcastBlock(blockNumber);
    this.optimisticService.cleanup();
    await this.updateStats(blockNumber);
  }

  /**
   * Decode a Buy event from the on-chain event data.
   * Layout: buyer(32) + btcIn(32) + tokensOut(32) + newPrice(32)
   */
  private decodeBuyEvent(event: unknown): BuyEventData | null {
    const data = this.getEventData(event);
    if (!data || data.length < 128) return null;

    return {
      buyer: this.readAddressFromEventData(data, 0),
      btcIn: this.readU256FromEventData(data, 32),
      tokensOut: this.readU256FromEventData(data, 64),
      newPrice: this.readU256FromEventData(data, 96),
    };
  }

  /**
   * Decode a Sell event from the on-chain event data.
   * Layout: seller(32) + tokensIn(32) + btcOut(32) + newPrice(32)
   */
  private decodeSellEvent(event: unknown): SellEventData | null {
    const data = this.getEventData(event);
    if (!data || data.length < 128) return null;

    return {
      seller: this.readAddressFromEventData(data, 0),
      tokensIn: this.readU256FromEventData(data, 32),
      btcOut: this.readU256FromEventData(data, 64),
      newPrice: this.readU256FromEventData(data, 96),
    };
  }

  /**
   * Decode a Graduation event from the on-chain event data.
   * Layout: triggerer(32) + finalBtcReserve(32)
   */
  private decodeGraduationEvent(event: unknown): GraduationEventData | null {
    const data = this.getEventData(event);
    if (!data || data.length < 64) return null;

    return {
      triggerer: this.readAddressFromEventData(data, 0),
      finalBtcReserve: this.readU256FromEventData(data, 32),
    };
  }

  /**
   * Decode a TokenDeployed event from the on-chain event data.
   * Layout: creator(32) + tokenAddress(32)
   */
  private decodeTokenDeployedEvent(event: unknown): TokenDeployedEventData | null {
    const data = this.getEventData(event);
    if (!data || data.length < 64) return null;

    return {
      creator: this.readAddressFromEventData(data, 0),
      tokenAddress: this.readAddressFromEventData(data, 32),
    };
  }

  /**
   * Extract raw event data as Uint8Array from an OPNet event object.
   */
  private getEventData(event: unknown): Uint8Array | null {
    const evt = event as Record<string, unknown>;

    // The OPNet SDK event structure may provide data in different formats
    if (evt.data instanceof Uint8Array) {
      return evt.data;
    }
    if (typeof evt.data === 'string') {
      // Hex-encoded data
      const hex = evt.data.startsWith('0x') ? evt.data.slice(2) : evt.data;
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
    // Some events may have properties directly decoded
    if (evt.properties && typeof evt.properties === 'object') {
      return null; // Handle via properties in the caller if needed
    }
    return null;
  }

  /**
   * Read a u256 from event data at the given byte offset (big-endian).
   */
  private readU256FromEventData(data: Uint8Array, offset: number): bigint {
    let value = 0n;
    for (let i = 0; i < 32; i++) {
      value = (value << 8n) | BigInt(data[offset + i]);
    }
    return value;
  }

  /**
   * Read an address from event data at the given byte offset.
   * Addresses are stored as u256 (32 bytes). We convert to hex.
   */
  private readAddressFromEventData(data: Uint8Array, offset: number): string {
    const bytes = data.slice(offset, offset + 32);
    let hex = '0x';
    for (const b of bytes) {
      hex += b.toString(16).padStart(2, '0');
    }
    return hex;
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
          pricePerToken: data.newPrice.toString(),
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

    // Broadcast trade
    this.wsService.broadcast(`token:trades:${tokenAddress}`, 'new_trade', {
      txHash,
      type: 'buy',
      traderAddress: data.buyer,
      btcAmount: data.btcIn.toString(),
      tokenAmount: data.tokensOut.toString(),
      pricePerToken: data.newPrice.toString(),
      status: 'confirmed',
      blockNumber,
    });

    // Broadcast price update
    this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
      currentPriceSats: data.newPrice.toString(),
      isOptimistic: false,
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

    await trades.updateOne(
      { _id: txHash },
      {
        $set: {
          tokenAddress,
          type: 'sell' as const,
          traderAddress: data.seller,
          btcAmount: data.btcOut.toString(),
          tokenAmount: data.tokensIn.toString(),
          pricePerToken: data.newPrice.toString(),
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

    this.wsService.broadcast(`token:trades:${tokenAddress}`, 'new_trade', {
      txHash,
      type: 'sell',
      traderAddress: data.seller,
      btcAmount: data.btcOut.toString(),
      tokenAmount: data.tokensIn.toString(),
      pricePerToken: data.newPrice.toString(),
      status: 'confirmed',
      blockNumber,
    });

    this.wsService.broadcast(`token:price:${tokenAddress}`, 'price_update', {
      currentPriceSats: data.newPrice.toString(),
      isOptimistic: false,
    });
  }

  /**
   * Calculate fee breakdown from a BTC amount using shared constants.
   */
  private calculateFeeBreakdown(amount: bigint): { platform: bigint; creator: bigint; minter: bigint } {
    const FEE_DENOMINATOR = 10_000n;
    const PLATFORM_FEE_BPS = 100n;
    const CREATOR_FEE_BPS = 25n;
    const MINTER_FEE_BPS = 25n;

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
      const result = await (contract as unknown as { getReserves: () => Promise<{ properties: { virtualBtc: bigint; virtualToken: bigint; realBtc: bigint; k: bigint } }> }).getReserves();

      if (result && result.properties) {
        const { virtualBtc, virtualToken, realBtc, k } = result.properties;
        const currentPrice = virtualToken > 0n ? (virtualBtc * DECIMALS_FACTOR) / virtualToken : 0n;

        const tokens = getTokensCollection();
        await tokens.updateOne(
          { _id: tokenAddress },
          {
            $set: {
              virtualBtcReserve: virtualBtc.toString(),
              virtualTokenSupply: virtualToken.toString(),
              kConstant: k.toString(),
              realBtcReserve: realBtc.toString(),
              currentPriceSats: currentPrice.toString(),
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
        const deployData = this.decodeTokenDeployedEvent(event);
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
          graduatedAtBlock: blockNumber,
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
  private async updateTokenStats(confirmedTrades: Array<Record<string, unknown>>): Promise<void> {
    const tokens = getTokensCollection();
    const tradesCol = getTradesCollection();

    // Collect unique token addresses from the confirmed trades
    const tokenAddresses = [...new Set(confirmedTrades.map((t) => String(t.tokenAddress)))];

    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    for (const tokenAddress of tokenAddresses) {
      try {
        // Aggregate 24h volume
        const volumeAgg = await tradesCol.aggregate([
          { $match: { tokenAddress, status: 'confirmed', createdAt: { $gte: oneDayAgo } } },
          { $group: { _id: null, volume: { $sum: { $toLong: '$btcAmount' } }, count: { $sum: 1 } } },
        ]).toArray();

        const volume24h = volumeAgg.length > 0 ? String(volumeAgg[0].volume) : '0';

        // Total trade count
        const tradeCount = await tradesCol.countDocuments({ tokenAddress, status: 'confirmed' });

        // Total volume
        const totalVolumeAgg = await tradesCol.aggregate([
          { $match: { tokenAddress, status: 'confirmed' } },
          { $group: { _id: null, total: { $sum: { $toLong: '$btcAmount' } } } },
        ]).toArray();
        const volumeTotal = totalVolumeAgg.length > 0 ? String(totalVolumeAgg[0].total) : '0';

        // Fetch current token to compute market cap from current price
        const token = await tokens.findOne({ _id: tokenAddress });
        let marketCapSats = '0';
        if (token) {
          const priceSats = BigInt(token.currentPriceSats || '0');
          const supply = BigInt(token.virtualTokenSupply || '0');
          if (supply > 0n) {
            marketCapSats = String(priceSats * supply / (10n ** 8n));
          }
        }

        // Unique holders count from confirmed buy trades
        const holderAgg = await tradesCol.aggregate([
          { $match: { tokenAddress, status: 'confirmed', type: 'buy' } },
          { $group: { _id: '$traderAddress' } },
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
              holderCount,
              marketCapSats,
              updatedAt: new Date(),
            },
          },
        );
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
    const totalTrades = await tradesCol.countDocuments({ status: 'confirmed' });

    const volumeAgg = await tradesCol.aggregate([
      { $match: { status: 'confirmed' } },
      { $group: { _id: null, total: { $sum: { $toLong: '$btcAmount' } } } },
    ]).toArray();
    const totalVolumeSats = volumeAgg.length > 0 ? String(volumeAgg[0].total) : '0';

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
  }
}

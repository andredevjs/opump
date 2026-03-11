/**
 * Scheduled indexer function — runs every 1 minute.
 * Processes new blocks, parses Buy/Sell/Graduation events,
 * writes trades to Redis, updates OHLCV candles and stats.
 */

import type { Config } from "@netlify/functions";
import { getRedis } from "./_shared/redis.mts";
import {
  getToken,
  saveToken,
  saveTrade,
  updateToken,
  updateOHLCV,
  getStats,
  updateStats,
  getLastBlockIndexed,
  setLastBlockIndexed,
  acquireIndexerLock,
  releaseIndexerLock,
  graduateToken,
  TOKEN_KEY,
  TIMEFRAME_SECONDS,
} from "./_shared/redis-queries.mts";
import { TOKEN_DECIMALS } from "./_shared/constants.mts";
import type { TradeDocument } from "./_shared/constants.mts";

const DECIMALS_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);
const MAX_BLOCKS_PER_RUN = 2;

// ─── Event data interfaces ─────────────────────────────────

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

// ─── Entry point ────────────────────────────────────────────

export default async () => {
  const locked = await acquireIndexerLock();
  if (!locked) {
    console.log("[Indexer] Another instance is running, exiting.");
    return;
  }

  try {
    const opnetRpcUrl = process.env.OPNET_RPC_URL || "https://testnet.opnet.org";
    const networkName = process.env.NETWORK || "testnet";
    const factoryAddress = process.env.FACTORY_ADDRESS || "";

    const { JSONRpcProvider, OPNetTransactionTypes, getContract, ABIDataTypes, BitcoinAbiTypes } = await import("opnet");
    const { networks } = await import("@btc-vision/bitcoin");
    const network = networkName === "mainnet" ? networks.bitcoin : networks.opnetTestnet;
    const provider = new JSONRpcProvider({ url: opnetRpcUrl, network });

    const lastBlock = await getLastBlockIndexed();
    const currentBlock = await provider.getBlockNumber();

    if (currentBlock <= BigInt(lastBlock)) {
      console.log("[Indexer] No new blocks.");
      return;
    }

    const redis = getRedis();
    const startBlock = BigInt(lastBlock) + 1n;
    const endBlock = currentBlock < startBlock + BigInt(MAX_BLOCKS_PER_RUN) - 1n
      ? currentBlock
      : startBlock + BigInt(MAX_BLOCKS_PER_RUN) - 1n;

    console.log(`[Indexer] Processing blocks ${startBlock} to ${endBlock}`);

    // Build known token set from Redis
    // We scan the search index to get all known addresses
    const knownTokenAddresses = new Set<string>();
    const allTokenEntries: string[] = await redis.zrange("op:idx:token:all:newest", 0, -1);
    for (const addr of allTokenEntries) {
      knownTokenAddresses.add(addr);
    }

    for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
      let block;
      try {
        block = await provider.getBlock(Number(blockNum), true);
      } catch (err) {
        console.error(`[Indexer] Failed to fetch block ${blockNum}:`, err instanceof Error ? err.message : err);
        continue;
      }

      if (!block || !block.transactions || block.transactions.length === 0) {
        await setLastBlockIndexed(Number(blockNum));
        continue;
      }

      const affectedTokens = new Set<string>();

      for (const tx of block.transactions) {
        if (tx.OPNetType !== OPNetTransactionTypes.Interaction) {
          // Check deployment transactions for factory events
          if (tx.OPNetType === OPNetTransactionTypes.Deployment && factoryAddress && tx.events) {
            const factoryEvents = tx.events[factoryAddress];
            if (factoryEvents) {
              for (const event of factoryEvents) {
                const eventType = (event as { type?: string }).type;
                if (eventType === "TokenDeployed") {
                  const data = getEventData(event);
                  if (data && data.length >= 64) {
                    const tokenAddr = readAddressFromEventData(data, 32);
                    knownTokenAddresses.add(tokenAddr);
                    console.log(`[Indexer] Discovered new token ${tokenAddr} at block ${blockNum}`);
                  }
                }
              }
            }
          }
          continue;
        }

        const interactionTx = tx as { contractAddress?: string; hash: string } & typeof tx;
        const contractAddr = interactionTx.contractAddress;
        if (!contractAddr) continue;

        const isKnownToken = knownTokenAddresses.has(contractAddr);
        const isFactory = factoryAddress && contractAddr === factoryAddress;
        if (!isKnownToken && !isFactory) continue;

        const events = tx.events;
        if (!events) continue;

        const contractEvents = events[contractAddr];
        if (!contractEvents || contractEvents.length === 0) continue;

        for (const event of contractEvents) {
          const eventType = (event as { type?: string }).type;
          if (!eventType) continue;

          try {
            if (eventType === "Buy" && isKnownToken) {
              const buyData = decodeBuyEvent(event);
              if (buyData) {
                await processBuyEvent(contractAddr, tx.hash, Number(blockNum), block.time, buyData);
                affectedTokens.add(contractAddr);
              }
            } else if (eventType === "Sell" && isKnownToken) {
              const sellData = decodeSellEvent(event);
              if (sellData) {
                await processSellEvent(contractAddr, tx.hash, Number(blockNum), block.time, sellData);
                affectedTokens.add(contractAddr);
              }
            } else if (eventType === "Graduation" && isKnownToken) {
              const data = getEventData(event);
              if (data && data.length >= 64) {
                await graduateToken(contractAddr, Number(blockNum));
                affectedTokens.add(contractAddr);
                console.log(`[Indexer] Token ${contractAddr} graduated at block ${blockNum}`);
              }
            } else if (eventType === "TokenDeployed" && isFactory) {
              const data = getEventData(event);
              if (data && data.length >= 64) {
                const tokenAddr = readAddressFromEventData(data, 32);
                knownTokenAddresses.add(tokenAddr);
                console.log(`[Indexer] Discovered new token ${tokenAddr} from factory at block ${blockNum}`);
              }
            }
          } catch (err) {
            console.error(`[Indexer] Error processing ${eventType} event in tx ${tx.hash}:`, err instanceof Error ? err.message : err);
          }
        }
      }

      // Sync on-chain reserves for affected tokens
      for (const tokenAddr of affectedTokens) {
        await syncTokenReserves(tokenAddr, provider, getContract, ABIDataTypes, BitcoinAbiTypes, network);
      }

      // Update per-token stats for affected tokens
      if (affectedTokens.size > 0) {
        await updateAffectedTokenStats(redis, [...affectedTokens]);
      }

      await setLastBlockIndexed(Number(blockNum));
    }

    // Update platform stats
    await updatePlatformStats(redis, Number(endBlock));

    console.log(`[Indexer] Done. Last block: ${endBlock}`);
  } catch (err) {
    console.error("[Indexer] Error:", err instanceof Error ? err.message : err);
  } finally {
    await releaseIndexerLock();
  }
};

export const config: Config = {
  schedule: "* * * * *",
};

// ─── Event processing ───────────────────────────────────────

async function processBuyEvent(
  tokenAddress: string,
  txHash: string,
  blockNumber: number,
  blockTime: number,
  data: BuyEventData,
): Promise<void> {
  const fees = calculateFeeBreakdown(data.btcIn);

  const trade: TradeDocument = {
    _id: txHash,
    tokenAddress,
    type: "buy",
    traderAddress: data.buyer,
    btcAmount: data.btcIn.toString(),
    tokenAmount: data.tokensOut.toString(),
    pricePerToken: data.newPrice.toString(),
    fees: {
      platform: fees.platform.toString(),
      creator: fees.creator.toString(),
      minter: fees.minter.toString(),
      flywheel: "0",
    },
    priceImpactBps: 0,
    status: "confirmed",
    blockNumber,
    blockTimestamp: new Date(blockTime * 1000),
    createdAt: new Date(),
  };

  await saveTrade(trade);

  // Update OHLCV for all timeframes
  const priceSats = Number(data.newPrice);
  const volumeSats = Number(data.btcIn);
  await updateOHLCV(tokenAddress, priceSats, volumeSats, blockTime);
}

async function processSellEvent(
  tokenAddress: string,
  txHash: string,
  blockNumber: number,
  blockTime: number,
  data: SellEventData,
): Promise<void> {
  const fees = calculateFeeBreakdown(data.btcOut);

  const trade: TradeDocument = {
    _id: txHash,
    tokenAddress,
    type: "sell",
    traderAddress: data.seller,
    btcAmount: data.btcOut.toString(),
    tokenAmount: data.tokensIn.toString(),
    pricePerToken: data.newPrice.toString(),
    fees: {
      platform: fees.platform.toString(),
      creator: fees.creator.toString(),
      minter: fees.minter.toString(),
      flywheel: "0",
    },
    priceImpactBps: 0,
    status: "confirmed",
    blockNumber,
    blockTimestamp: new Date(blockTime * 1000),
    createdAt: new Date(),
  };

  await saveTrade(trade);

  const priceSats = Number(data.newPrice);
  const volumeSats = Number(data.btcOut);
  await updateOHLCV(tokenAddress, priceSats, volumeSats, blockTime);
}

function calculateFeeBreakdown(amount: bigint): { platform: bigint; creator: bigint; minter: bigint } {
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

// ─── Reserve sync ───────────────────────────────────────────

async function syncTokenReserves(
  tokenAddress: string,
  provider: import("opnet").JSONRpcProvider,
  getContractFn: typeof import("opnet").getContract,
  ABIDataTypes: typeof import("opnet").ABIDataTypes,
  BitcoinAbiTypes: typeof import("opnet").BitcoinAbiTypes,
  network: unknown,
): Promise<void> {
  try {
    const abi: import("opnet").BitcoinInterfaceAbi = [
      {
        name: "getReserves",
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
          { name: "virtualBtc", type: ABIDataTypes.UINT256 },
          { name: "virtualToken", type: ABIDataTypes.UINT256 },
          { name: "realBtc", type: ABIDataTypes.UINT256 },
          { name: "k", type: ABIDataTypes.UINT256 },
        ],
      },
    ];

    const contract = getContractFn(tokenAddress, abi, provider, network as import("@btc-vision/bitcoin").Network);
    const result = await (contract as unknown as {
      getReserves: () => Promise<{ properties: { virtualBtc: bigint; virtualToken: bigint; realBtc: bigint; k: bigint } }>;
    }).getReserves();

    if (result && result.properties) {
      const { virtualBtc, virtualToken, realBtc, k } = result.properties;
      const currentPrice = virtualToken > 0n ? (virtualBtc * DECIMALS_FACTOR) / virtualToken : 0n;
      const marketCap = currentPrice * virtualToken / (10n ** 8n);

      await updateToken(tokenAddress, {
        virtualBtcReserve: virtualBtc.toString(),
        virtualTokenSupply: virtualToken.toString(),
        kConstant: k.toString(),
        realBtcReserve: realBtc.toString(),
        currentPriceSats: currentPrice.toString(),
        marketCapSats: marketCap.toString(),
      });
    }
  } catch (err) {
    console.error(`[Indexer] Failed to sync reserves for ${tokenAddress}:`, err instanceof Error ? err.message : err);
  }
}

// ─── Stats updates ──────────────────────────────────────────

async function updateAffectedTokenStats(redis: import("@upstash/redis").Redis, tokenAddresses: string[]): Promise<void> {
  for (const tokenAddress of tokenAddresses) {
    try {
      // Count trades from the trade index
      const tradeCount = await redis.zcard(`op:idx:trade:token:${tokenAddress}`);

      // We can't easily do 24h volume aggregation from Redis sorted sets alone,
      // so we approximate by summing recent trades.
      // For a proper implementation, the OHLCV 1d candles provide volume data.
      const token = await getToken(tokenAddress);
      if (token) {
        await updateToken(tokenAddress, {
          tradeCount,
          status: token.status,
        });
      }
    } catch (err) {
      console.error(`[Indexer] Failed to update stats for ${tokenAddress}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function updatePlatformStats(redis: import("@upstash/redis").Redis, lastBlock: number): Promise<void> {
  try {
    const totalTokens = await redis.zcard("op:idx:token:all:newest");
    const totalGraduated = await redis.zcard("op:idx:token:graduated:newest");

    // Count total trades across all token trade indexes is expensive;
    // we increment from the existing stats instead
    const currentStats = await getStats();

    await updateStats({
      totalTokens,
      totalGraduated,
      totalVolumeSats: currentStats.totalVolumeSats,
      totalTrades: currentStats.totalTrades,
      lastBlockIndexed: lastBlock,
    });
  } catch (err) {
    console.error("[Indexer] Failed to update platform stats:", err instanceof Error ? err.message : err);
  }
}

// ─── Event decoding helpers ─────────────────────────────────

function decodeBuyEvent(event: unknown): BuyEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 128) return null;

  return {
    buyer: readAddressFromEventData(data, 0),
    btcIn: readU256FromEventData(data, 32),
    tokensOut: readU256FromEventData(data, 64),
    newPrice: readU256FromEventData(data, 96),
  };
}

function decodeSellEvent(event: unknown): SellEventData | null {
  const data = getEventData(event);
  if (!data || data.length < 128) return null;

  return {
    seller: readAddressFromEventData(data, 0),
    tokensIn: readU256FromEventData(data, 32),
    btcOut: readU256FromEventData(data, 64),
    newPrice: readU256FromEventData(data, 96),
  };
}

function getEventData(event: unknown): Uint8Array | null {
  const evt = event as Record<string, unknown>;

  if (evt.data instanceof Uint8Array) {
    return evt.data;
  }
  if (typeof evt.data === "string") {
    const hex = evt.data.startsWith("0x") ? evt.data.slice(2) : evt.data;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return null;
}

function readU256FromEventData(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 32; i++) {
    value = (value << 8n) | BigInt(data[offset + i]);
  }
  return value;
}

function readAddressFromEventData(data: Uint8Array, offset: number): string {
  const bytes = data.slice(offset, offset + 32);
  let hex = "0x";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

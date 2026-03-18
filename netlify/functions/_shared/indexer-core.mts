/**
 * Core indexer logic — shared between the scheduled function and HTTP trigger.
 * Processes new blocks, parses Buy/Sell/Graduation events,
 * writes trades to Redis, updates OHLCV candles and stats.
 */

import { getRedis } from "./redis.mts";
import {
  getToken,
  getTokensBatch,
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
  getHolderCount,
  TRADE_KEY,
} from "./redis-queries.mts";
import {
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  FEE_DENOMINATOR,
} from "./constants.mts";
import type { TradeDocument } from "./constants.mts";
import type { LaunchTokenContract, OPNetEvent } from "./contracts.mts";
import { decodeBuyEvent, decodeSellEvent, getEventData, readAddressFromEventData } from "./event-decoders.mts";
import type { BuyEventData, SellEventData } from "./event-decoders.mts";

/** Convert a PRICE_PRECISION-scaled bigint to "sats per whole token" string */
function toDisplayPrice(scaled: bigint): string {
  return (Number(scaled) / PRICE_DISPLAY_DIVISOR).toString();
}

export interface IndexerResult {
  blocksProcessed: number;
  tradesFound: number;
  lastBlock: number;
  skipped?: string;
}

/**
 * Run the indexer. Processes up to `maxBlocks` new blocks.
 * Returns a summary of what was processed.
 */
export async function runIndexer(maxBlocks = 2): Promise<IndexerResult> {
  const locked = await acquireIndexerLock();
  if (!locked) {
    return { blocksProcessed: 0, tradesFound: 0, lastBlock: 0, skipped: "locked" };
  }

  try {
    const opnetRpcUrl = process.env.OPNET_RPC_URL || "https://testnet.opnet.org";
    const networkName = process.env.NETWORK || "testnet";
    const factoryAddress = process.env.FACTORY_ADDRESS || "";
    if (!factoryAddress) {
      console.warn('[Indexer] FACTORY_ADDRESS not set — token discovery disabled');
    }

    const { JSONRpcProvider, OPNetTransactionTypes, getContract, ABIDataTypes, BitcoinAbiTypes } = await import("opnet");
    const { networks } = await import("@btc-vision/bitcoin");
    const network = networkName === "mainnet" ? networks.bitcoin : networks.opnetTestnet;
    const provider = new JSONRpcProvider({ url: opnetRpcUrl, network });

    let lastBlock = await getLastBlockIndexed();
    const currentBlock = await provider.getBlockNumber();
    const currentBlockNum = Number(currentBlock);

    if (currentBlock <= BigInt(lastBlock)) {
      return { blocksProcessed: 0, tradesFound: 0, lastBlock, skipped: "no_new_blocks" };
    }

    // Auto-catch-up: only skip if we're massively behind (500+ blocks).
    // Small gaps are processed normally so trades aren't permanently lost.
    const gap = currentBlockNum - lastBlock;
    if (gap > 500) {
      const skipTo = currentBlockNum - maxBlocks;
      console.log(`[Indexer] Gap too large (${gap} blocks). Skipping from ${lastBlock} to ${skipTo}`);
      await setLastBlockIndexed(skipTo);
      lastBlock = skipTo;
    }

    const redis = getRedis();
    const startBlock = BigInt(lastBlock) + 1n;
    const endBlock = currentBlock < startBlock + BigInt(maxBlocks) - 1n
      ? currentBlock
      : startBlock + BigInt(maxBlocks) - 1n;

    console.log(`[Indexer] Processing blocks ${startBlock} to ${endBlock}`);

    // Build known token set from Redis
    const knownTokenAddresses = new Set<string>();
    const allTokenEntries: string[] = await redis.zrange("op:idx:token:all:newest", 0, -1);
    for (const addr of allTokenEntries) {
      knownTokenAddresses.add(addr);
    }

    let totalTradesFound = 0;

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
          if (tx.OPNetType === OPNetTransactionTypes.Deployment && factoryAddress && tx.events) {
            const factoryEvents = tx.events[factoryAddress];
            if (factoryEvents) {
              for (const event of factoryEvents) {
                const evt = event as OPNetEvent;
                if (evt.type === "TokenDeployed") {
                  const data = getEventData(evt);
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

        const interactionTx = tx as typeof tx & { contractAddress?: string; hash: string };
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
          const evt = event as OPNetEvent;
          const eventType = evt.type;
          if (!eventType) continue;

          try {
            if (eventType === "Buy" && isKnownToken) {
              const buyData = decodeBuyEvent(evt);
              if (buyData) {
                await processBuyEvent(contractAddr, tx.hash, Number(blockNum), block.time, buyData);
                affectedTokens.add(contractAddr);
                totalTradesFound++;
              }
            } else if (eventType === "Sell" && isKnownToken) {
              const sellData = decodeSellEvent(evt);
              if (sellData) {
                await processSellEvent(contractAddr, tx.hash, Number(blockNum), block.time, sellData);
                affectedTokens.add(contractAddr);
                totalTradesFound++;
              }
            } else if (eventType === "Graduation" && isKnownToken) {
              const data = getEventData(evt);
              if (data && data.length >= 64) {
                await graduateToken(contractAddr, Number(blockNum));
                affectedTokens.add(contractAddr);
                console.log(`[Indexer] Token ${contractAddr} graduated at block ${blockNum}`);
              }
            } else if (eventType === "TokenDeployed" && isFactory) {
              const data = getEventData(evt);
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

      // Bulk-confirm any pending trades whose txHash appears in this block.
      // Safety net: even if event parsing misses a trade, its inclusion in a
      // block proves it was confirmed on-chain.
      const blockTxHashes = block.transactions.map((tx: { hash: string }) => tx.hash).filter(Boolean);
      if (blockTxHashes.length > 0) {
        const statusPipe = redis.pipeline();
        for (const txHash of blockTxHashes) {
          statusPipe.hget(TRADE_KEY(txHash), "status");
        }
        const statuses = await statusPipe.exec();

        const confirmPipe = redis.pipeline();
        let needConfirm = false;
        for (let i = 0; i < blockTxHashes.length; i++) {
          if (statuses[i] === "pending") {
            confirmPipe.hset(TRADE_KEY(blockTxHashes[i]), {
              status: "confirmed",
              blockNumber: String(blockNum),
              blockTimestamp: normalizeBlockTime(block.time).toISOString(),
            });
            needConfirm = true;
          }
        }
        if (needConfirm) {
          await confirmPipe.exec();
          console.log(`[Indexer] Bulk-confirmed pending trades in block ${blockNum}`);
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

    console.log(`[Indexer] Done. Last block: ${endBlock}, trades found: ${totalTradesFound}`);
    return { blocksProcessed: Number(endBlock - startBlock) + 1, tradesFound: totalTradesFound, lastBlock: Number(endBlock) };
  } catch (err) {
    console.error("[Indexer] Error:", err instanceof Error ? err.message : err);
    throw err;
  } finally {
    await releaseIndexerLock();
  }
}

// ─── Event processing ───────────────────────────────────────

async function processBuyEvent(
  tokenAddress: string,
  txHash: string,
  blockNumber: number,
  blockTime: number,
  data: BuyEventData,
): Promise<void> {
  const fees = calculateFeeBreakdown(data.btcIn);

  // Effective trade price (gross btcIn / tokensOut) for the trade record
  const pricePerToken = data.tokensOut > 0n
    ? toDisplayPrice((data.btcIn * PRICE_PRECISION) / data.tokensOut)
    : "0";

  const trade: TradeDocument = {
    _id: txHash,
    tokenAddress,
    type: "buy",
    traderAddress: data.buyer,
    btcAmount: data.btcIn.toString(),
    tokenAmount: data.tokensOut.toString(),
    pricePerToken,
    fees: {
      platform: fees.platform.toString(),
      creator: fees.creator.toString(),
      minter: fees.minter.toString(),
      flywheel: "0",
    },
    priceImpactBps: 0,
    status: "confirmed",
    blockNumber,
    blockTimestamp: normalizeBlockTime(blockTime),
    createdAt: new Date(),
  };

  await saveTrade(trade);

  // Use the contract's post-trade spot price (newPrice) for OHLCV candles.
  // This is the canonical price from the on-chain reserves after the trade,
  // consistent across all trades and avoiding gross/net BTC mismatches.
  const spotPrice = data.newPrice > 0n ? toDisplayPrice(data.newPrice) : pricePerToken;
  const priceSats = Number(spotPrice);
  const volumeSats = Number(data.btcIn);
  const ohlcvTime = Math.floor(normalizeBlockTime(blockTime).getTime() / 1000);
  await updateOHLCV(tokenAddress, priceSats, volumeSats, ohlcvTime);
}

async function processSellEvent(
  tokenAddress: string,
  txHash: string,
  blockNumber: number,
  blockTime: number,
  data: SellEventData,
): Promise<void> {
  const fees = calculateFeeBreakdown(data.btcOut);

  const pricePerToken = data.tokensIn > 0n
    ? toDisplayPrice((data.btcOut * PRICE_PRECISION) / data.tokensIn)
    : "0";

  const trade: TradeDocument = {
    _id: txHash,
    tokenAddress,
    type: "sell",
    traderAddress: data.seller,
    btcAmount: data.btcOut.toString(),
    tokenAmount: data.tokensIn.toString(),
    pricePerToken,
    fees: {
      platform: fees.platform.toString(),
      creator: fees.creator.toString(),
      minter: fees.minter.toString(),
      flywheel: "0",
    },
    priceImpactBps: 0,
    status: "confirmed",
    blockNumber,
    blockTimestamp: normalizeBlockTime(blockTime),
    createdAt: new Date(),
  };

  await saveTrade(trade);

  // Use the contract's post-trade spot price (newPrice) for OHLCV candles.
  const spotPrice = data.newPrice > 0n ? toDisplayPrice(data.newPrice) : pricePerToken;
  const priceSats = Number(spotPrice);
  const volumeSats = Number(data.btcOut);
  const ohlcvTime = Math.floor(normalizeBlockTime(blockTime).getTime() / 1000);
  await updateOHLCV(tokenAddress, priceSats, volumeSats, ohlcvTime);
}

/**
 * Normalize block.time to a Date. OPNet RPC may return seconds or milliseconds.
 * If the value looks like milliseconds (> year 2100 as seconds), don't multiply.
 */
function normalizeBlockTime(blockTime: number): Date {
  // If blockTime > 1e12, it's already in milliseconds
  if (blockTime > 1_000_000_000_000) {
    return new Date(blockTime);
  }
  return new Date(blockTime * 1000);
}

function calculateFeeBreakdown(amount: bigint): { platform: bigint; creator: bigint; minter: bigint } {
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
  network: import("@btc-vision/bitcoin").Network,
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

    const contract = getContractFn(tokenAddress, abi, provider, network);
    const result = await (contract as unknown as LaunchTokenContract).getReserves();

    if (result && result.properties) {
      const { virtualBtc, virtualToken, realBtc, k } = result.properties;
      const currentPriceScaled = virtualToken > 0n ? (virtualBtc * PRICE_PRECISION) / virtualToken : 0n;
      const marketCap = virtualToken > 0n ? virtualBtc * INITIAL_VIRTUAL_TOKEN_SUPPLY / virtualToken : 0n;

      await updateToken(tokenAddress, {
        virtualBtcReserve: virtualBtc.toString(),
        virtualTokenSupply: virtualToken.toString(),
        kConstant: k.toString(),
        realBtcReserve: realBtc.toString(),
        currentPriceSats: toDisplayPrice(currentPriceScaled),
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
      const tradeCount = await redis.zcard(`op:idx:trade:token:${tokenAddress}`);

      // Holders set is maintained incrementally by saveTrade() (adds buyers on buy events)
      const holderCount = await getHolderCount(tokenAddress);

      // Calculate 24h and total volume from trades
      const volume24h = await calculateVolume24h(redis, tokenAddress);
      const volumeTotal = await calculateVolumeTotal(redis, tokenAddress);
      const tradeCount24h = await calculateTradeCount24h(redis, tokenAddress);

      const token = await getToken(tokenAddress);
      if (token) {
        await updateToken(tokenAddress, {
          tradeCount,
          tradeCount24h,
          holderCount,
          volume24h,
          volumeTotal,
          status: token.status,
        });
      }
    } catch (err) {
      console.error(`[Indexer] Failed to update stats for ${tokenAddress}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function calculateVolume24h(redis: import("@upstash/redis").Redis, tokenAddress: string): Promise<string> {
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  // Trade index is scored by createdAtMs — use zrange with byScore for Upstash compatibility
  const txHashes: string[] = await redis.zrange(
    `op:idx:trade:token:${tokenAddress}`,
    oneDayAgoMs,
    "+inf",
    { byScore: true },
  );
  if (txHashes.length === 0) return "0";

  const pipe = redis.pipeline();
  for (const hash of txHashes) {
    pipe.hget(`op:trade:${hash}`, "btcAmount");
  }
  const results = await pipe.exec();

  let totalSats = 0n;
  for (const raw of results) {
    if (raw) totalSats += BigInt(String(raw));
  }
  console.log(`[Indexer] volume24h for ${tokenAddress}: ${totalSats} sats from ${txHashes.length} trades`);
  return totalSats.toString();
}

async function calculateTradeCount24h(redis: import("@upstash/redis").Redis, tokenAddress: string): Promise<number> {
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const txHashes: string[] = await redis.zrange(
    `op:idx:trade:token:${tokenAddress}`,
    oneDayAgoMs,
    "+inf",
    { byScore: true },
  );
  return txHashes.length;
}

async function calculateVolumeTotal(redis: import("@upstash/redis").Redis, tokenAddress: string): Promise<string> {
  const txHashes: string[] = await redis.zrange(`op:idx:trade:token:${tokenAddress}`, 0, -1);
  if (txHashes.length === 0) return "0";

  const pipe = redis.pipeline();
  for (const hash of txHashes) {
    pipe.hget(`op:trade:${hash}`, "btcAmount");
  }
  const results = await pipe.exec();

  let totalSats = 0n;
  for (const raw of results) {
    if (raw) totalSats += BigInt(String(raw));
  }
  return totalSats.toString();
}

async function updatePlatformStats(redis: import("@upstash/redis").Redis, lastBlock: number): Promise<void> {
  try {
    const totalTokens = await redis.zcard("op:idx:token:all:newest");
    const totalGraduated = await redis.zcard("op:idx:token:graduated:newest");

    // Aggregate total trades and volume across all tokens (batch fetch)
    const allTokenAddrs: string[] = await redis.zrange("op:idx:token:all:newest", 0, -1);
    const tokens = await getTokensBatch(redis, allTokenAddrs);
    let totalTrades = 0;
    let totalVolumeSats = 0n;
    for (const token of tokens) {
      totalTrades += token.tradeCount || 0;
      totalVolumeSats += BigInt(token.volumeTotal || "0");
    }

    await updateStats({
      totalTokens,
      totalGraduated,
      totalVolumeSats: totalVolumeSats.toString(),
      totalTrades,
      lastBlockIndexed: lastBlock,
    });
  } catch (err) {
    console.error("[Indexer] Failed to update platform stats:", err instanceof Error ? err.message : err);
  }
}

// Event decoding helpers are in event-decoders.mts

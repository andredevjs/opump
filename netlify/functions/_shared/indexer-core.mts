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
  updateStats,
  getLastBlockIndexed,
  setLastBlockIndexed,
  acquireIndexerLock,
  releaseIndexerLock,
  graduateToken,
  migrateToken,
  compareAndSwapReserves,
  claimSideEffects,
  completeSideEffects,
  isOhlcvApplied,
  ohlcvMarkerKey,
  isReferralCredited,
  referralMarkerKey,
  TRADE_KEY,
} from "./redis-queries.mts";
import {
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  FEE_DENOMINATOR,
  GRADUATION_THRESHOLD_SATS,
  DEFAULT_MAX_SUPPLY,
  TOKEN_UNITS_PER_TOKEN,
} from "./constants.mts";
import type { TradeDocument } from "./constants.mts";
import { calculateBuyCost, calculatePrice } from "./bonding-curve.mts";
import type { OPNetEvent } from "./contracts.mts";
import { decodeBuyEvent, decodeSellEvent, decodeMigrationEvent, getEventData, readAddressFromEventData, hexAddressToBech32m } from "./event-decoders.mts";
import type { BuyEventData, SellEventData } from "./event-decoders.mts";

/**
 * Convert an effective-price-per-unit value (btcSats * PRICE_PRECISION / tokenUnits)
 * to "sats per whole token" string.
 */
function toDisplayPrice(scaled: bigint): string {
  return (Number(scaled) / PRICE_DISPLAY_DIVISOR).toString();
}

/**
 * Convert a calculatePrice() result (sats-per-whole-token × PRICE_PRECISION)
 * to "sats per whole token" string.
 */
function spotPriceToDisplay(scaled: bigint): string {
  return (Number(scaled) / Number(PRICE_PRECISION)).toString();
}

/**
 * Resolve a TXID from a WTXID via the RPC provider.
 * Block transactions only expose `hash` (WTXID); we need `id` (TXID) for canonical keying.
 * Falls back to the WTXID if the RPC call fails.
 */
export async function resolveTxId(provider: { getTransaction: (hash: string) => Promise<{ id?: string } | null> }, wtxid: string): Promise<string> {
  try {
    const tx = await provider.getTransaction(wtxid);
    if (tx?.id) return tx.id;
  } catch (err) {
    console.warn(`[Indexer] Failed to resolve TXID for ${wtxid}:`, err instanceof Error ? err.message : err);
  }
  console.warn(`[Indexer] Could not resolve TXID for ${wtxid}, falling back to WTXID`);
  return wtxid;
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

    const { JSONRpcProvider, OPNetTransactionTypes } = await import("opnet");
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
      const resolvedWtxids = new Set<string>(); // WTXIDs already processed by event parsing

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
                    // Confirm deployment: update deployBlock for optimistically saved tokens
                    const existingToken = await getToken(tokenAddr);
                    if (existingToken && (!existingToken.deployBlock || existingToken.deployBlock === 0)) {
                      await updateToken(tokenAddr, { deployBlock: Number(blockNum) });
                      console.log(`[Indexer] Confirmed token ${tokenAddr} at block ${blockNum}`);
                    } else {
                      console.log(`[Indexer] Discovered new token ${tokenAddr} at block ${blockNum}`);
                    }
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
                const txId = await resolveTxId(provider, tx.hash);
                resolvedWtxids.add(tx.hash);
                await processBuyEvent(contractAddr, txId, tx.hash, Number(blockNum), block.time, buyData, network);
                affectedTokens.add(contractAddr);
                totalTradesFound++;
              }
            } else if (eventType === "Sell" && isKnownToken) {
              const sellData = decodeSellEvent(evt);
              if (sellData) {
                const txId = await resolveTxId(provider, tx.hash);
                resolvedWtxids.add(tx.hash);
                await processSellEvent(contractAddr, txId, tx.hash, Number(blockNum), block.time, sellData, network);
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
            } else if (eventType === "Migration" && isKnownToken) {
              const migData = decodeMigrationEvent(evt);
              if (migData) {
                const recipientBech32 = hexAddressToBech32m(migData.recipient, network);
                await migrateToken(
                  contractAddr,
                  tx.hash,
                  migData.tokenAmount.toString(),
                  recipientBech32,
                );
                affectedTokens.add(contractAddr);
                console.log(`[Indexer] Token ${contractAddr} migrated at block ${blockNum}`);
              }
            } else if (eventType === "TokenDeployed" && isFactory) {
              const data = getEventData(evt);
              if (data && data.length >= 64) {
                const tokenAddr = readAddressFromEventData(data, 32);
                knownTokenAddresses.add(tokenAddr);
                const existingToken = await getToken(tokenAddr);
                if (existingToken && (!existingToken.deployBlock || existingToken.deployBlock === 0)) {
                  await updateToken(tokenAddr, { deployBlock: Number(blockNum) });
                  console.log(`[Indexer] Confirmed token ${tokenAddr} at block ${blockNum}`);
                } else {
                  console.log(`[Indexer] Discovered new token ${tokenAddr} from factory at block ${blockNum}`);
                }
              }
            }
          } catch (err) {
            console.error(`[Indexer] Error processing ${eventType} event in tx ${tx.hash}:`, err instanceof Error ? err.message : err);
          }
        }
      }

      // Bulk-confirm any pending trades whose TXID appears in this block.
      // Safety net: even if event parsing misses a trade, its inclusion in a
      // block proves it was confirmed on-chain.
      // Skip WTXIDs already processed by event parsing above.
      const unprocessedTxs = block.transactions
        .map((tx: { hash: string }) => tx.hash)
        .filter((h: string) => h && !resolvedWtxids.has(h));
      if (unprocessedTxs.length > 0) {
        // Resolve TXIDs for unprocessed transactions
        const txIdPairs: Array<{ txId: string; wtxid: string }> = [];
        for (const wtxid of unprocessedTxs) {
          const txId = await resolveTxId(provider, wtxid);
          txIdPairs.push({ txId, wtxid });
        }

        const statusPipe = redis.pipeline();
        for (const { txId } of txIdPairs) {
          statusPipe.hget(TRADE_KEY(txId), "status");
        }
        const statuses = await statusPipe.exec();

        const confirmPipe = redis.pipeline();
        let needConfirm = false;
        for (let i = 0; i < txIdPairs.length; i++) {
          if (statuses[i] === "pending") {
            confirmPipe.hset(TRADE_KEY(txIdPairs[i].txId), {
              status: "confirmed",
              txHash: txIdPairs[i].wtxid,
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

      // Reserves/price are updated optimistically by trades-submit (mempool-first).
      // For confirmed-only trades (never staged), processBuyEvent/processSellEvent
      // resync reserves via CAS. Stats are always reconciled from trade history.
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

// ─── Reserve resync for confirmed-only trades ───────────────

/**
 * When the indexer discovers a confirmed trade that was never seen by
 * trades-submit (isNew=true), the token's reserve/price/supply fields
 * are stale. This function recalculates them from the curve integral
 * and applies via CAS so concurrent pending trades are not clobbered.
 *
 * The key insight: realBtcReserve = ∫₀ˢ a·e^(bx) dx = calculateBuyCost(a,b,0,S).
 * Since supply changes are additive (order-independent), applying the
 * delta to the current supply and recomputing the integral gives the
 * correct reserve regardless of trade ordering.
 *
 * Price and market cap are recomputed from newSupply via calculatePrice()
 * rather than taken from the event, because Redis supply may already
 * include later optimistic trades — using the event's historical price
 * would regress the live spot price.
 */
async function resyncReservesForTrade(
  tokenAddress: string,
  txId: string,
  supplyDelta: bigint,
  blockNumber: number,
): Promise<void> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const token = await getToken(tokenAddress);
    if (!token) return;

    const currentSupply = BigInt(token.currentSupplyOnCurve);
    const aScaled = BigInt(token.aScaled);
    const bScaled = BigInt(token.bScaled);

    const newSupply = currentSupply + supplyDelta;
    if (newSupply < 0n) {
      console.warn(`[Indexer] Reserve resync: newSupply would be negative for ${tokenAddress}, skipping`);
      return;
    }

    // Reserve = curve integral from 0 to newSupply
    const newReserve = calculateBuyCost(aScaled, bScaled, 0n, newSupply);
    // Recompute spot price from the merged supply so we never regress
    // past later optimistic trades already reflected in Redis.
    const priceScaled = calculatePrice(aScaled, bScaled, newSupply);
    const newPriceSats = spotPriceToDisplay(priceScaled);
    const marketCapSats = (priceScaled * DEFAULT_MAX_SUPPLY / (PRICE_PRECISION * TOKEN_UNITS_PER_TOKEN)).toString();

    let newStatus = token.status;
    if (token.status === "active" && newReserve >= GRADUATION_THRESHOLD_SATS) {
      newStatus = "graduated";
    }

    const casResult = await compareAndSwapReserves(tokenAddress, token.reserveVersion, txId, {
      currentPriceSats: newPriceSats,
      currentSupplyOnCurve: newSupply.toString(),
      realBtcReserve: newReserve.toString(),
      marketCapSats,
      status: newStatus,
    });

    if (casResult === "ok") {
      if (newStatus === "graduated" && token.status === "active") {
        await graduateToken(tokenAddress, blockNumber);
      }
      return;
    }
    if (casResult === "trade_already_applied") return;
    // version_mismatch → re-read and retry
    console.warn(`[Indexer] Reserve resync CAS retry ${attempt + 1}/${MAX_RETRIES} for ${tokenAddress}`);
  }
  console.warn(`[Indexer] Reserve resync failed after ${MAX_RETRIES} retries for ${tokenAddress}`);
}

// ─── Event processing ───────────────────────────────────────

async function processBuyEvent(
  tokenAddress: string,
  txId: string,
  wtxid: string,
  blockNumber: number,
  blockTime: number,
  data: BuyEventData,
  network: import("@btc-vision/bitcoin").Network,
): Promise<void> {
  const fees = calculateFeeBreakdown(data.btcIn);

  // Effective trade price (gross btcIn / tokensOut) for the trade record
  const pricePerToken = data.tokensOut > 0n
    ? toDisplayPrice((data.btcIn * PRICE_PRECISION) / data.tokensOut)
    : "0";

  const trade: TradeDocument = {
    _id: txId,
    txHash: wtxid,
    tokenAddress,
    type: "buy",
    traderAddress: data.buyer,
    btcAmount: data.btcIn.toString(),
    tokenAmount: data.tokensOut.toString(),
    pricePerToken,
    fees: {
      platform: fees.platform.toString(),
      creator: fees.creator.toString(),
      flywheel: "0",
    },
    priceImpactBps: 0,
    status: "confirmed",
    blockNumber,
    blockTimestamp: normalizeBlockTime(blockTime),
    createdAt: new Date(),
  };

  const { isNew } = await saveTrade(trade);

  // Confirmed-only trade (never seen by trades-submit) — resync reserves
  if (isNew) {
    await resyncReservesForTrade(tokenAddress, txId, data.tokensOut, blockNumber);
  }

  // Acquire short-lived lease. If trades-submit crashed after CAS but
  // before claiming, we take over. If it crashed mid-flight, its 30 s
  // lease will have expired and we re-acquire here.
  const fxClaim = await claimSideEffects(txId);
  if (fxClaim === "claimed") {
    // ── OHLCV (marker in same pipeline = atomic) ──
    const ohlcvDone = await isOhlcvApplied(txId);
    if (!ohlcvDone) {
      const spotPrice = data.newPrice > 0n ? spotPriceToDisplay(data.newPrice) : pricePerToken;
      const priceSats = Number(spotPrice);
      const volumeSats = Number(data.btcIn);
      const ohlcvTime = Math.floor(normalizeBlockTime(blockTime).getTime() / 1000);
      await updateOHLCV(tokenAddress, priceSats, volumeSats, ohlcvTime, ohlcvMarkerKey(txId));
    }

    // ── Referral credit (marker in same pipeline = atomic) ──
    let referralFailed = false;
    try {
      const alreadyCredited = await isReferralCredited(txId);
      if (!alreadyCredited) {
        const { getReferrer, creditReferralEarnings } = await import("./referral-queries.mts");
        const referrer = await getReferrer(trade.traderAddress);
        if (referrer) {
          const platformFee = BigInt(trade.fees.platform);
          const referralReward = (platformFee * 10n) / 100n;
          if (referralReward > 0n) {
            await creditReferralEarnings(referrer, referralReward.toString(), referralMarkerKey(txId));
          }
        }
      }
    } catch (refErr) {
      referralFailed = true;
      console.warn("[Indexer] Referral credit failed, leaving lease for retry:", refErr instanceof Error ? refErr.message : refErr);
    }

    if (!referralFailed) {
      await completeSideEffects(txId);
    }
  }
}

async function processSellEvent(
  tokenAddress: string,
  txId: string,
  wtxid: string,
  blockNumber: number,
  blockTime: number,
  data: SellEventData,
  network: import("@btc-vision/bitcoin").Network,
): Promise<void> {
  const fees = calculateFeeBreakdown(data.btcOut);

  const pricePerToken = data.tokensIn > 0n
    ? toDisplayPrice((data.btcOut * PRICE_PRECISION) / data.tokensIn)
    : "0";

  const trade: TradeDocument = {
    _id: txId,
    txHash: wtxid,
    tokenAddress,
    type: "sell",
    traderAddress: data.seller,
    btcAmount: data.btcOut.toString(),
    tokenAmount: data.tokensIn.toString(),
    pricePerToken,
    fees: {
      platform: fees.platform.toString(),
      creator: fees.creator.toString(),
      flywheel: "0",
    },
    priceImpactBps: 0,
    status: "confirmed",
    blockNumber,
    blockTimestamp: normalizeBlockTime(blockTime),
    createdAt: new Date(),
  };

  const { isNew } = await saveTrade(trade);

  // Confirmed-only trade — resync reserves (negative delta for sells)
  if (isNew) {
    await resyncReservesForTrade(tokenAddress, txId, -data.tokensIn, blockNumber);
  }

  const fxClaim = await claimSideEffects(txId);
  if (fxClaim === "claimed") {
    // ── OHLCV (marker in same pipeline = atomic) ──
    const ohlcvDone = await isOhlcvApplied(txId);
    if (!ohlcvDone) {
      const spotPrice = data.newPrice > 0n ? spotPriceToDisplay(data.newPrice) : pricePerToken;
      const priceSats = Number(spotPrice);
      const volumeSats = Number(data.btcOut);
      const ohlcvTime = Math.floor(normalizeBlockTime(blockTime).getTime() / 1000);
      await updateOHLCV(tokenAddress, priceSats, volumeSats, ohlcvTime, ohlcvMarkerKey(txId));
    }

    // ── Referral credit (marker in same pipeline = atomic) ──
    let referralFailed = false;
    try {
      const alreadyCredited = await isReferralCredited(txId);
      if (!alreadyCredited) {
        const { getReferrer, creditReferralEarnings } = await import("./referral-queries.mts");
        const referrer = await getReferrer(trade.traderAddress);
        if (referrer) {
          const platformFee = BigInt(trade.fees.platform);
          const referralReward = (platformFee * 10n) / 100n;
          if (referralReward > 0n) {
            await creditReferralEarnings(referrer, referralReward.toString(), referralMarkerKey(txId));
          }
        }
      }
    } catch (refErr) {
      referralFailed = true;
      console.warn("[Indexer] Referral credit failed, leaving lease for retry:", refErr instanceof Error ? refErr.message : refErr);
    }

    if (!referralFailed) {
      await completeSideEffects(txId);
    }
  }
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

function calculateFeeBreakdown(amount: bigint): { platform: bigint; creator: bigint } {
  return {
    platform: (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR,
    creator: (amount * CREATOR_FEE_BPS) / FEE_DENOMINATOR,
  };
}

// ─── Stats updates ──────────────────────────────────────────

async function updateAffectedTokenStats(redis: import("@upstash/redis").Redis, tokenAddresses: string[]): Promise<void> {
  for (const tokenAddress of tokenAddresses) {
    try {
      const tradeCount = await redis.zcard(`op:idx:trade:token:${tokenAddress}`);
      const holderCount = await redis.scard(`op:holders:${tokenAddress}`);
      const volume24h = await calculateVolume24h(redis, tokenAddress);
      const volumeTotal = await calculateVolumeTotal(redis, tokenAddress);
      const tradeCount24h = await calculateTradeCount24h(redis, tokenAddress);

      const token = await getToken(tokenAddress);
      if (!token) continue;

      await updateToken(tokenAddress, {
        tradeCount,
        tradeCount24h,
        holderCount,
        volume24h,
        volumeTotal,
        status: token.status,
      });
    } catch (err) {
      console.error(`[Indexer] Failed to update stats for ${tokenAddress}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function calculateVolume24h(redis: import("@upstash/redis").Redis, tokenAddress: string): Promise<string> {
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
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

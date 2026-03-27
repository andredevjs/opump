/**
 * Redis data access layer — all token/trade CRUD and query operations.
 * Uses Upstash Redis REST client with pipelines for batch reads.
 */

import type { Redis } from "@upstash/redis";
import { getRedis } from "./redis.mts";
import type { TokenDocument, TokenStatus } from "./constants.mts";
import type { TradeDocument } from "./constants.mts";

// ─── Key helpers ────────────────────────────────────────────

const TOKEN_KEY = (addr: string) => `op:token:${addr}`;
const TRADE_KEY = (txHash: string) => `op:trade:${txHash}`;

const TOKEN_INDEX = (status: string, sort: string) => `op:idx:token:${status}:${sort}`;
const TOKEN_CREATOR_INDEX = (creator: string) => `op:idx:token:creator:${creator}`;
const TOKEN_SEARCH_INDEX = "op:idx:token:search";

const TRADE_TOKEN_INDEX = (tokenAddr: string) => `op:idx:trade:token:${tokenAddr}`;
const TRADE_TRADER_INDEX = (traderAddr: string) => `op:idx:trade:trader:${traderAddr}`;
const TOKEN_HOLDERS_SET = (tokenAddr: string) => `op:holders:${tokenAddr}`;
const TOKEN_HOLDER_BALANCES = (tokenAddr: string) => `op:holders:bal:${tokenAddr}`;

const STATS_KEY = "op:stats";
const INDEXER_LAST_BLOCK = "op:indexer:lastBlock";
const INDEXER_LOCK = "op:indexer:lock";

// Sort fields used in sorted set indexes
const SORT_FIELDS = ["volume24h", "marketCap", "price", "newest"] as const;

// ─── Token operations ───────────────────────────────────────

/**
 * Store a token document in Redis as a hash + update all sorted set indexes.
 */
export async function saveToken(token: TokenDocument): Promise<void> {
  const redis = getRedis();
  const key = TOKEN_KEY(token.contractAddress);

  // Serialize the token into flat hash fields
  const flat = flattenToken(token);
  const pipe = redis.pipeline();

  // Store the hash
  pipe.hset(key, flat);

  // Update sorted set indexes for the token's status and "all"
  const statuses = [token.status, "all"];
  for (const status of statuses) {
    pipe.zadd(TOKEN_INDEX(status, "volume24h"), { score: parseFloat(token.volume24h || "0"), member: token.contractAddress });
    pipe.zadd(TOKEN_INDEX(status, "marketCap"), { score: parseFloat(token.marketCapSats || "0"), member: token.contractAddress });
    pipe.zadd(TOKEN_INDEX(status, "price"), { score: parseFloat(token.currentPriceSats || "0"), member: token.contractAddress });
    pipe.zadd(TOKEN_INDEX(status, "newest"), { score: token.createdAt instanceof Date ? token.createdAt.getTime() : Date.now(), member: token.contractAddress });
  }

  // Creator index
  pipe.zadd(TOKEN_CREATOR_INDEX(token.creatorAddress), {
    score: token.createdAt instanceof Date ? token.createdAt.getTime() : Date.now(),
    member: token.contractAddress,
  });

  // Search index (lexicographic)
  const nameLower = token.name.toLowerCase();
  const symbolLower = token.symbol.toLowerCase();
  pipe.zadd(TOKEN_SEARCH_INDEX, { score: 0, member: `${nameLower}\0${token.contractAddress}` });
  pipe.zadd(TOKEN_SEARCH_INDEX, { score: 0, member: `${symbolLower}\0${token.contractAddress}` });

  await pipe.exec();
}

/**
 * Get a single token by contract address.
 */
export async function getToken(contractAddress: string): Promise<TokenDocument | null> {
  const redis = getRedis();
  const raw = await redis.hgetall(TOKEN_KEY(contractAddress));
  if (!raw || Object.keys(raw).length === 0) return null;
  return unflattenToken(raw as Record<string, unknown>);
}

/**
 * List tokens with pagination, filtering, sorting.
 */
export async function listTokens(opts: {
  status?: string;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
  search?: string;
}): Promise<{ tokens: TokenDocument[]; total: number }> {
  const redis = getRedis();
  const status = opts.status || "all";
  const sort = opts.sort || "newest";
  const order = opts.order || "desc";
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));

  // Search mode
  if (opts.search) {
    return searchTokens(opts.search, page, limit, status);
  }

  // Validate sort field against allowed values, default to "newest"
  const sortField = (SORT_FIELDS as readonly string[]).includes(sort) ? sort : "newest";
  const indexKey = TOKEN_INDEX(status, sortField);

  const total = await redis.zcard(indexKey);
  if (total === 0) return { tokens: [], total: 0 };

  const start = (page - 1) * limit;
  const stop = start + limit - 1;

  let addresses: string[];
  if (order === "desc") {
    addresses = await redis.zrange(indexKey, start, stop, { rev: true });
  } else {
    addresses = await redis.zrange(indexKey, start, stop);
  }

  if (addresses.length === 0) return { tokens: [], total };

  const tokens = await getTokensBatch(redis, addresses);
  return { tokens, total };
}

/**
 * Search tokens by prefix (name or symbol).
 */
async function searchTokens(query: string, page: number, limit: number, status: string): Promise<{ tokens: TokenDocument[]; total: number }> {
  const redis = getRedis();
  const queryLower = query.toLowerCase();

  // ZRANGEBYLEX for prefix matching — Upstash uses zrange with byLex option
  const matches: string[] = await redis.zrange(
    TOKEN_SEARCH_INDEX,
    `[${queryLower}`,
    `[${queryLower}\xff`,
    { byLex: true },
  );

  // Extract unique addresses from "name\0address" entries
  const addressSet = new Set<string>();
  for (const entry of matches) {
    const parts = entry.split("\0");
    if (parts.length >= 2) {
      addressSet.add(parts[parts.length - 1]);
    }
  }

  let allAddresses = [...addressSet];

  // Filter by status if not "all" — check membership in the status-specific sorted set
  if (status !== "all" && allAddresses.length > 0) {
    const statusKey = TOKEN_INDEX(status, "newest");
    const pipe = redis.pipeline();
    for (const addr of allAddresses) {
      pipe.zscore(statusKey, addr);
    }
    const scores = await pipe.exec();
    allAddresses = allAddresses.filter((_, i) => scores[i] !== null);
  }

  const total = allAddresses.length;
  const start = (page - 1) * limit;
  const sliced = allAddresses.slice(start, start + limit);

  if (sliced.length === 0) return { tokens: [], total };

  const tokens = await getTokensBatch(redis, sliced);
  return { tokens, total };
}

/**
 * Get tokens created by a specific address.
 */
export async function getTokensByCreator(creatorAddress: string): Promise<TokenDocument[]> {
  const redis = getRedis();
  const addresses: string[] = await redis.zrange(TOKEN_CREATOR_INDEX(creatorAddress), 0, -1, { rev: true });
  if (addresses.length === 0) return [];
  return getTokensBatch(redis, addresses);
}

/**
 * Batch-fetch multiple tokens by address.
 */
export async function getTokensBatch(redis: Redis, addresses: string[]): Promise<TokenDocument[]> {
  const pipe = redis.pipeline();
  for (const addr of addresses) {
    pipe.hgetall(TOKEN_KEY(addr));
  }
  const results = await pipe.exec();
  const tokens: TokenDocument[] = [];
  for (const raw of results) {
    if (raw !== null && typeof raw === "object" && Object.keys(raw as object).length > 0) {
      tokens.push(unflattenToken(raw as Record<string, unknown>));
    }
  }
  return tokens;
}

/**
 * Update specific fields on a token hash and refresh indexes.
 */
export async function updateToken(contractAddress: string, fields: Partial<Record<string, string | number>>): Promise<void> {
  const redis = getRedis();
  const pipe = redis.pipeline();

  pipe.hset(TOKEN_KEY(contractAddress), { ...fields, updatedAt: new Date().toISOString() });

  // Execute hset first before refreshing indexes
  await pipe.exec();

  // Always refresh sort indexes — "newest" depends on createdAt which must stay in sync
  const status = (fields.status as string) || null;
  const existingStatus = status || (await redis.hget(TOKEN_KEY(contractAddress), "status") as string | null);
  await refreshTokenIndexes(contractAddress, existingStatus || 'active', fields);
}

async function refreshTokenIndexes(contractAddress: string, status: string, fields: Partial<Record<string, string | number>>): Promise<void> {
  const redis = getRedis();
  const pipe = redis.pipeline();
  const statuses = [status, "all"];

  // Read createdAt from token hash so "newest" index always reflects creation time
  const createdAtRaw = await redis.hget(TOKEN_KEY(contractAddress), "createdAt") as string | null;
  const createdAtMs = createdAtRaw ? new Date(createdAtRaw).getTime() : Date.now();

  for (const s of statuses) {
    if (fields.volume24h !== undefined) {
      pipe.zadd(TOKEN_INDEX(s, "volume24h"), { score: parseFloat(String(fields.volume24h)), member: contractAddress });
    }
    if (fields.marketCapSats !== undefined) {
      pipe.zadd(TOKEN_INDEX(s, "marketCap"), { score: parseFloat(String(fields.marketCapSats)), member: contractAddress });
    }
    if (fields.currentPriceSats !== undefined) {
      pipe.zadd(TOKEN_INDEX(s, "price"), { score: parseFloat(String(fields.currentPriceSats)), member: contractAddress });
    }
    pipe.zadd(TOKEN_INDEX(s, "newest"), { score: createdAtMs, member: contractAddress });
  }

  await pipe.exec();
}

/**
 * Move a token from active to graduated status in indexes.
 */
export async function graduateToken(contractAddress: string, blockNumber: number): Promise<void> {
  const redis = getRedis();

  // Step 1: Read all scores first (parallel reads)
  const [score1, score2, score3, score4] = await Promise.all([
    redis.zscore(TOKEN_INDEX("active", "volume24h"), contractAddress),
    redis.zscore(TOKEN_INDEX("active", "marketCap"), contractAddress),
    redis.zscore(TOKEN_INDEX("active", "price"), contractAddress),
    redis.zscore(TOKEN_INDEX("active", "newest"), contractAddress),
  ]);
  const scores = [
    { field: "volume24h", score: score1 },
    { field: "marketCap", score: score2 },
    { field: "price", score: score3 },
    { field: "newest", score: score4 },
  ];

  // Step 2: Single pipeline for all writes
  const pipe = redis.pipeline();

  pipe.hset(TOKEN_KEY(contractAddress), {
    status: "graduated",
    graduatedAt: blockNumber,
    updatedAt: new Date().toISOString(),
  });

  // Remove from active indexes, add to graduated indexes
  for (const { field, score } of scores) {
    pipe.zrem(TOKEN_INDEX("active", field), contractAddress);
    if (score !== null) {
      pipe.zadd(TOKEN_INDEX("graduated", field), { score, member: contractAddress });
    }
  }

  await pipe.exec();
}

/**
 * Optimistically mark a token as migrating (mempool-first).
 * Called when the creator submits the migrate() transaction.
 */
export async function startMigration(
  contractAddress: string,
  migrateTxHash: string,
): Promise<void> {
  const redis = getRedis();

  await redis.hset(TOKEN_KEY(contractAddress), {
    status: "migrating",
    migrationStatus: "pending",
    migrationTxHashes: JSON.stringify({ migrate: migrateTxHash }),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Move a token from graduated/migrating to migrated status in indexes.
 * Called by the indexer when a confirmed Migration event is detected.
 */
export async function migrateToken(
  contractAddress: string,
  migrateTxHash: string,
  liquidityTokens: string,
  recipientAddress: string,
): Promise<void> {
  const redis = getRedis();

  // Read scores from both graduated and migrating indexes (token could be in either)
  const [score1, score2, score3, score4] = await Promise.all([
    redis.zscore(TOKEN_INDEX("graduated", "volume24h"), contractAddress),
    redis.zscore(TOKEN_INDEX("graduated", "marketCap"), contractAddress),
    redis.zscore(TOKEN_INDEX("graduated", "price"), contractAddress),
    redis.zscore(TOKEN_INDEX("graduated", "newest"), contractAddress),
  ]);
  const scores = [
    { field: "volume24h", score: score1 },
    { field: "marketCap", score: score2 },
    { field: "price", score: score3 },
    { field: "newest", score: score4 },
  ];

  const pipe = redis.pipeline();

  pipe.hset(TOKEN_KEY(contractAddress), {
    status: "migrated",
    migrationStatus: "tokens_minted",
    migrationLiquidityTokens: liquidityTokens,
    migrationTxHashes: JSON.stringify({ migrate: migrateTxHash }),
    updatedAt: new Date().toISOString(),
  });

  // Remove from graduated indexes, add to migrated indexes
  for (const { field, score } of scores) {
    pipe.zrem(TOKEN_INDEX("graduated", field), contractAddress);
    if (score !== null) {
      pipe.zadd(TOKEN_INDEX("migrated", field), { score, member: contractAddress });
    }
  }

  await pipe.exec();
}

// ─── Trade operations ───────────────────────────────────────

/**
 * Save a trade and update all indexes + holder tracking.
 * If the trade already exists, its original createdAt is preserved so that
 * confirmation by the indexer doesn't overwrite the original trade time.
 */
export async function saveTrade(trade: TradeDocument): Promise<{ isNew: boolean }> {
  const redis = getRedis();
  const key = TRADE_KEY(trade._id);

  // Preserve the original createdAt if this trade was already submitted
  const existingCreatedAt = await redis.hget(key, "createdAt") as string | null;
  const isNew = !existingCreatedAt;
  if (existingCreatedAt) {
    trade = { ...trade, createdAt: new Date(existingCreatedAt) };
  }

  const flat = flattenTrade(trade);
  const createdAtMs = trade.createdAt instanceof Date ? trade.createdAt.getTime() : Date.now();

  const pipe = redis.pipeline();
  pipe.hset(key, flat);
  pipe.zadd(TRADE_TOKEN_INDEX(trade.tokenAddress), { score: createdAtMs, member: trade._id });
  pipe.zadd(TRADE_TRADER_INDEX(trade.traderAddress), { score: createdAtMs, member: trade._id });
  await pipe.exec();

  // Update per-holder balance tracking (handles both buy and sell)
  if (isNew) {
    await updateHolderBalance(trade.tokenAddress, trade.traderAddress, trade.tokenAmount, trade.type);
  }

  return { isNew };
}

/**
 * Find and remove an orphaned pending trade that matches a confirmed trade.
 *
 * When the indexer confirms a trade from a block, the on-chain txHash may differ
 * from the broadcast hash stored by trades-submit. This finds a pending trade
 * with matching tokenAddress + type + tokenAmount and removes it so we don't
 * double-count volume/trades.
 *
 * Returns the orphan's txHash if one was found and removed, or null.
 */
export async function findAndRemoveOrphanedPendingTrade(
  confirmedTxHash: string,
  tokenAddress: string,
  type: "buy" | "sell",
  traderAddress: string,
): Promise<string | null> {
  const redis = getRedis();
  const indexKey = TRADE_TOKEN_INDEX(tokenAddress);

  // Fetch the 50 most recent txHashes (newest first) — orphans are recent
  const recentHashes: string[] = await redis.zrange(indexKey, 0, 49, { rev: true });
  if (recentHashes.length === 0) return null;

  // Pipeline-fetch status, type, and traderAddress for each
  const pipe = redis.pipeline();
  for (const hash of recentHashes) {
    pipe.hmget(TRADE_KEY(hash), "status", "type", "traderAddress");
  }
  const results = await pipe.exec();

  // Find the first pending trade that matches type + traderAddress but has a different hash.
  // We match on traderAddress instead of tokenAmount because the frontend simulation
  // amount can differ from the on-chain amount due to slippage.
  let orphanHash: string | null = null;
  for (let i = 0; i < recentHashes.length; i++) {
    const hash = recentHashes[i];
    if (hash === confirmedTxHash) continue;

    const fields = results[i] as [string | null, string | null, string | null] | null;
    if (!fields) continue;

    const [status, tradeType, tradeTrader] = fields;
    if (status === "pending" && tradeType === type && tradeTrader === traderAddress) {
      orphanHash = hash;
      break;
    }
  }

  if (!orphanHash) return null;

  // Remove the orphan: delete hash, remove from token index and trader index
  const deletePipe = redis.pipeline();
  deletePipe.del(TRADE_KEY(orphanHash));
  deletePipe.zrem(indexKey, orphanHash);
  deletePipe.zrem(TRADE_TRADER_INDEX(traderAddress), orphanHash);
  await deletePipe.exec();

  console.log(`[Dedup] Removed orphaned pending trade ${orphanHash} (confirmed as ${confirmedTxHash})`);
  return orphanHash;
}

/**
 * Get the number of unique holders for a token.
 */
export async function getHolderCount(tokenAddress: string): Promise<number> {
  const redis = getRedis();
  return redis.scard(TOKEN_HOLDERS_SET(tokenAddress));
}

/**
 * Update a holder's token balance in the sorted set.
 * On buy: increment balance. On sell: decrement and remove if zero.
 */
export async function updateHolderBalance(
  tokenAddress: string,
  traderAddress: string,
  tokenAmount: string,
  type: "buy" | "sell",
): Promise<void> {
  const redis = getRedis();
  const balKey = TOKEN_HOLDER_BALANCES(tokenAddress);
  const amount = Number(tokenAmount);

  if (type === "buy") {
    await redis.zincrby(balKey, amount, traderAddress);
    await redis.sadd(TOKEN_HOLDERS_SET(tokenAddress), traderAddress);
  } else {
    const newScore = await redis.zincrby(balKey, -amount, traderAddress);
    if (newScore <= 0) {
      await redis.zrem(balKey, traderAddress);
      await redis.srem(TOKEN_HOLDERS_SET(tokenAddress), traderAddress);
    }
  }
}

/**
 * Get the top holders for a token, ordered by balance descending.
 */
export async function getTopHolders(
  tokenAddress: string,
  limit = 10,
): Promise<{ address: string; balance: string }[]> {
  const redis = getRedis();
  const balKey = TOKEN_HOLDER_BALANCES(tokenAddress);

  const results: string[] = await redis.zrange(balKey, 0, limit - 1, { rev: true, withScores: true });

  // Results come as [member, score, member, score, ...]
  const holders: { address: string; balance: string }[] = [];
  for (let i = 0; i < results.length; i += 2) {
    const address = results[i];
    const balance = results[i + 1];
    if (Number(balance) > 0) {
      holders.push({ address, balance: String(Math.round(Number(balance))) });
    }
  }
  return holders;
}

/**
 * List trades for a token with pagination.
 */
export async function listTradesForToken(tokenAddress: string, page: number, limit: number): Promise<{ trades: TradeDocument[]; total: number }> {
  const redis = getRedis();
  const indexKey = TRADE_TOKEN_INDEX(tokenAddress);

  const total = await redis.zcard(indexKey);
  if (total === 0) return { trades: [], total: 0 };

  const start = (page - 1) * limit;
  const stop = start + limit - 1;
  const txHashes: string[] = await redis.zrange(indexKey, start, stop, { rev: true });

  if (txHashes.length === 0) return { trades: [], total };

  const pipe = redis.pipeline();
  for (const hash of txHashes) {
    pipe.hgetall(TRADE_KEY(hash));
  }
  const results = await pipe.exec();

  const trades: TradeDocument[] = [];
  for (const raw of results) {
    if (raw && typeof raw === "object" && Object.keys(raw).length > 0) {
      trades.push(unflattenTrade(raw as Record<string, string>));
    }
  }

  return { trades, total };
}

// ─── OHLCV operations (extracted to redis-ohlcv.mts) ────────

export { updateOHLCV, getOHLCV, TIMEFRAME_SECONDS } from "./redis-ohlcv.mts";

// ─── Stats operations ───────────────────────────────────────

export async function getStats(): Promise<{ totalTokens: number; totalGraduated: number; totalVolumeSats: string; totalTrades: number; lastBlockIndexed: number }> {
  const redis = getRedis();
  const raw = await redis.hgetall(STATS_KEY);
  if (!raw || Object.keys(raw).length === 0) {
    return { totalTokens: 0, totalGraduated: 0, totalVolumeSats: "0", totalTrades: 0, lastBlockIndexed: 0 };
  }
  const r = raw as Record<string, string>;
  return {
    totalTokens: parseInt(r.totalTokens || "0"),
    totalGraduated: parseInt(r.totalGraduated || "0"),
    totalVolumeSats: r.totalVolumeSats || "0",
    totalTrades: parseInt(r.totalTrades || "0"),
    lastBlockIndexed: parseInt(r.lastBlockIndexed || "0"),
  };
}

export async function updateStats(fields: Record<string, string | number>): Promise<void> {
  const redis = getRedis();
  await redis.hset(STATS_KEY, { ...fields, updatedAt: new Date().toISOString() });
}

// ─── Indexer state ──────────────────────────────────────────

export async function getLastBlockIndexed(): Promise<number> {
  const redis = getRedis();
  const val = await redis.get(INDEXER_LAST_BLOCK);
  return val ? parseInt(String(val)) : 0;
}

export async function setLastBlockIndexed(block: number): Promise<void> {
  const redis = getRedis();
  await redis.set(INDEXER_LAST_BLOCK, block);
}

export async function acquireIndexerLock(): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.set(INDEXER_LOCK, "1", { nx: true, ex: 55 });
  return result === "OK";
}

export async function releaseIndexerLock(): Promise<void> {
  const redis = getRedis();
  await redis.del(INDEXER_LOCK);
}

// ─── Serialization helpers ──────────────────────────────────

function flattenToken(token: TokenDocument): Record<string, string> {
  return {
    _id: token._id,
    name: token.name,
    symbol: token.symbol,
    description: token.description || "",
    imageUrl: token.imageUrl || "",
    socials: JSON.stringify(token.socials || {}),
    creatorAddress: token.creatorAddress,
    contractAddress: token.contractAddress,
    virtualBtcReserve: token.virtualBtcReserve,
    virtualTokenSupply: token.virtualTokenSupply,
    kConstant: token.kConstant,
    realBtcReserve: token.realBtcReserve,
    config: JSON.stringify(token.config),
    status: token.status,
    currentPriceSats: token.currentPriceSats,
    volume24h: token.volume24h,
    volumeTotal: token.volumeTotal,
    marketCapSats: token.marketCapSats,
    tradeCount: String(token.tradeCount),
    holderCount: String(token.holderCount),
    deployBlock: String(token.deployBlock),
    deployTxHash: token.deployTxHash,
    graduatedAt: token.graduatedAt !== undefined ? String(token.graduatedAt) : "",
    migrationStatus: token.migrationStatus || "",
    migrationLiquidityTokens: token.migrationLiquidityTokens || "",
    migrationTxHashes: JSON.stringify(token.migrationTxHashes || {}),
    nativeSwapPoolToken: token.nativeSwapPoolToken || "",
    createdAt: token.createdAt instanceof Date ? token.createdAt.toISOString() : String(token.createdAt),
    updatedAt: token.updatedAt instanceof Date ? token.updatedAt.toISOString() : String(token.updatedAt),
  };
}

function unflattenToken(raw: Record<string, unknown>): TokenDocument {
  return {
    _id: String(raw._id),
    name: String(raw.name),
    symbol: String(raw.symbol),
    description: String(raw.description || ""),
    imageUrl: String(raw.imageUrl || ""),
    socials: safeJsonParse(raw.socials as string | object | undefined, {}),
    creatorAddress: String(raw.creatorAddress),
    contractAddress: String(raw.contractAddress),
    virtualBtcReserve: String(raw.virtualBtcReserve),
    virtualTokenSupply: String(raw.virtualTokenSupply),
    kConstant: String(raw.kConstant),
    realBtcReserve: String(raw.realBtcReserve),
    config: (() => {
      const cfg = safeJsonParse(raw.config as string | object | undefined, {
        creatorAllocationBps: 0,
        buyTaxBps: 0,
        sellTaxBps: 0,
        flywheelDestination: "burn" as const,
        graduationThreshold: "0",
      });
      if (cfg.flywheelDestination === "communityPool") cfg.flywheelDestination = "creator";
      return cfg;
    })(),
    status: (String(raw.status || "active")) as TokenStatus,
    currentPriceSats: String(raw.currentPriceSats || "0"),
    volume24h: String(raw.volume24h || "0"),
    volumeTotal: String(raw.volumeTotal || "0"),
    marketCapSats: String(raw.marketCapSats || "0"),
    tradeCount: parseInt(String(raw.tradeCount || "0")),
    holderCount: parseInt(String(raw.holderCount || "0")),
    deployBlock: parseInt(String(raw.deployBlock || "0")),
    deployTxHash: String(raw.deployTxHash || ""),
    graduatedAt: raw.graduatedAt ? parseInt(String(raw.graduatedAt)) : undefined,
    migrationStatus: raw.migrationStatus ? String(raw.migrationStatus) as TokenDocument['migrationStatus'] : undefined,
    migrationLiquidityTokens: raw.migrationLiquidityTokens ? String(raw.migrationLiquidityTokens) : undefined,
    migrationTxHashes: raw.migrationTxHashes ? safeJsonParse(raw.migrationTxHashes as string | object | undefined, undefined) : undefined,
    nativeSwapPoolToken: raw.nativeSwapPoolToken ? String(raw.nativeSwapPoolToken) : undefined,
    createdAt: new Date(String(raw.createdAt)),
    updatedAt: new Date(String(raw.updatedAt)),
  };
}

function flattenTrade(trade: TradeDocument): Record<string, string> {
  return {
    _id: trade._id,
    tokenAddress: trade.tokenAddress,
    type: trade.type,
    traderAddress: trade.traderAddress,
    btcAmount: trade.btcAmount,
    tokenAmount: trade.tokenAmount,
    pricePerToken: trade.pricePerToken,
    fees: JSON.stringify(trade.fees),
    priceImpactBps: String(trade.priceImpactBps),
    status: trade.status,
    blockNumber: trade.blockNumber !== undefined ? String(trade.blockNumber) : "",
    blockTimestamp: trade.blockTimestamp instanceof Date ? trade.blockTimestamp.toISOString() : (trade.blockTimestamp || ""),
    createdAt: trade.createdAt instanceof Date ? trade.createdAt.toISOString() : String(trade.createdAt),
  };
}

function unflattenTrade(raw: Record<string, string>): TradeDocument {
  return {
    _id: raw._id,
    tokenAddress: raw.tokenAddress,
    type: raw.type as "buy" | "sell",
    traderAddress: raw.traderAddress,
    btcAmount: raw.btcAmount,
    tokenAmount: raw.tokenAmount,
    pricePerToken: raw.pricePerToken,
    fees: safeJsonParse(raw.fees, { platform: "0", creator: "0", flywheel: "0" }),
    priceImpactBps: parseInt(raw.priceImpactBps || "0"),
    status: (raw.status as "pending" | "confirmed") || "confirmed",
    blockNumber: raw.blockNumber ? parseInt(raw.blockNumber) : undefined,
    blockTimestamp: raw.blockTimestamp ? new Date(raw.blockTimestamp) : undefined,
    createdAt: new Date(raw.createdAt),
  };
}

function safeJsonParse<T>(value: string | object | undefined, fallback: T): T {
  if (!value) return fallback;
  // Upstash Redis REST client auto-parses JSON strings into objects
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ─── Exported for indexer use ───────────────────────────────

export {
  TOKEN_KEY,
  TRADE_KEY,
  TOKEN_INDEX,
  TOKEN_HOLDERS_SET,
  TOKEN_HOLDER_BALANCES,
  STATS_KEY,
  INDEXER_LAST_BLOCK,
};

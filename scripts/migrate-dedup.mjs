/**
 * One-off script: Fix duplicate trades caused by TXID/WTXID mismatch.
 *
 * Scans all trades in Redis, identifies WTXID-keyed duplicates by resolving
 * the TXID via OPNet RPC, re-keys them, and rebuilds OHLCV + holder balances.
 *
 * Usage:
 *   node scripts/migrate-dedup.mjs              # dry run (default)
 *   node scripts/migrate-dedup.mjs --apply      # actually modify data
 *
 * Reads credentials from frontend/.env. Safe to run multiple times (idempotent).
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "../frontend/.env"), "utf8");
const env = {};
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2].trim();
}

const UPSTASH_URL = env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;
const RPC_URL = env.VITE_OPNET_RPC_URL || "https://testnet.opnet.org";

const dryRun = !process.argv.includes("--apply");

if (dryRun) {
  console.log("=== DRY RUN (pass --apply to modify data) ===\n");
} else {
  console.log("=== APPLYING CHANGES ===\n");
}

// ─── Redis helpers ───────────────────────────────────────────

async function redisPipeline(commands) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(commands),
  });
  const data = await res.json();
  return data.map((r) => r.result);
}

async function redisCmd(...args) {
  const res = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  return data.result;
}

async function redisScan(pattern) {
  const keys = [];
  let cursor = "0";
  do {
    const result = await redisCmd("SCAN", cursor, "MATCH", pattern, "COUNT", "100");
    cursor = result[0];
    keys.push(...result[1]);
  } while (cursor !== "0");
  return keys;
}

// ─── OPNet RPC helper ────────────────────────────────────────

async function getTransaction(hash) {
  try {
    const res = await fetch(RPC_URL + "/api/v1/json-rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "btc_getTransactionByHash",
        params: [hash],
        id: 1,
      }),
    });
    const data = await res.json();
    return data.result || null;
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────

console.log(`Redis: ${UPSTASH_URL}`);
console.log(`RPC:   ${RPC_URL}\n`);

// Step 1: Scan all trade keys
console.log("Scanning trade keys...");
const tradeKeys = await redisScan("op:trade:*");
console.log(`Found ${tradeKeys.length} trade keys.\n`);

if (tradeKeys.length === 0) {
  console.log("No trades to process.");
  process.exit(0);
}

// Step 2: Read all trades
// Upstash REST returns HGETALL as flat arrays [k, v, k, v, ...] — convert to objects
function arrToObj(arr) {
  if (!Array.isArray(arr)) return arr; // already an object
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) obj[arr[i]] = arr[i + 1];
  return obj;
}

const readCmds = tradeKeys.map((key) => ["HGETALL", key]);
// Process in batches of 50 to avoid pipeline limits
const allTrades = [];
for (let i = 0; i < readCmds.length; i += 50) {
  const batch = readCmds.slice(i, i + 50);
  const results = await redisPipeline(batch);
  allTrades.push(...results.map(arrToObj));
}

// Step 3: Identify confirmed trades that might be WTXID-keyed
const affectedTokens = new Set();
let duplicatesFound = 0;
let alreadyCorrect = 0;
let pending = 0;

for (let i = 0; i < tradeKeys.length; i++) {
  const raw = allTrades[i];
  if (!raw || !raw._id) continue;

  if (raw.status !== "confirmed") {
    pending++;
    continue;
  }

  // Try to resolve the TXID via RPC
  const tx = await getTransaction(raw._id);
  if (!tx) {
    // Can't resolve — might be too old or RPC doesn't have it
    continue;
  }

  const txId = tx.id || tx.txid;
  if (!txId) continue;

  if (txId === raw._id) {
    alreadyCorrect++;
    continue;
  }

  // This trade is keyed by WTXID — it's a duplicate!
  duplicatesFound++;
  const wtxid = raw._id;
  const tokenAddress = raw.tokenAddress;
  affectedTokens.add(tokenAddress);

  console.log(`  DUPLICATE: ${wtxid}`);
  console.log(`    → TXID:  ${txId}`);
  console.log(`    → Token: ${tokenAddress}`);
  console.log(`    → Type:  ${raw.type}, Amount: ${raw.btcAmount} sats`);

  if (dryRun) continue;

  // Check if pending trade exists at the TXID key
  const existingCreatedAt = await redisCmd("HGET", `op:trade:${txId}`, "createdAt");

  // Build re-keyed trade
  const newFields = [];
  for (const [k, v] of Object.entries(raw)) {
    if (k === "_id") {
      newFields.push("_id", txId);
    } else {
      newFields.push(k, v);
    }
  }
  newFields.push("txHash", wtxid);
  if (existingCreatedAt) {
    // Preserve original pending submission timestamp
    const idx = newFields.indexOf("createdAt");
    if (idx !== -1) newFields[idx + 1] = existingCreatedAt;
  }

  const createdAtMs = existingCreatedAt
    ? new Date(existingCreatedAt).getTime()
    : raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now();

  // Write corrected trade and clean up in a pipeline
  const writeCmds = [
    // Save trade under TXID key
    ["HSET", `op:trade:${txId}`, ...newFields],
    // Update token index: remove WTXID, add TXID
    ["ZREM", `op:idx:trade:token:${tokenAddress}`, wtxid],
    ["ZADD", `op:idx:trade:token:${tokenAddress}`, createdAtMs.toString(), txId],
    // Delete WTXID-keyed record
    ["DEL", `op:trade:${wtxid}`],
  ];
  // Update trader index if available
  if (raw.traderAddress) {
    writeCmds.push(["ZREM", `op:idx:trade:trader:${raw.traderAddress}`, wtxid]);
    writeCmds.push(["ZADD", `op:idx:trade:trader:${raw.traderAddress}`, createdAtMs.toString(), txId]);
  }
  // Delete orphaned pending record if it exists
  if (existingCreatedAt) {
    // The pending record at TXID key was already overwritten by our HSET above
    console.log(`    Merged with pending record (preserved createdAt: ${existingCreatedAt})`);
  }

  await redisPipeline(writeCmds);
  console.log(`    Re-keyed successfully.`);
}

console.log(`\n--- Summary ---`);
console.log(`Total trades scanned: ${tradeKeys.length}`);
console.log(`Already correct:      ${alreadyCorrect}`);
console.log(`Pending (skipped):    ${pending}`);
console.log(`Duplicates found:     ${duplicatesFound}`);
console.log(`Affected tokens:      ${affectedTokens.size}`);

if (duplicatesFound === 0) {
  console.log("\nNo duplicates found. Nothing to do.");
  process.exit(0);
}

if (dryRun) {
  console.log("\nRun with --apply to fix these duplicates.");
  process.exit(0);
}

// Step 4: Rebuild OHLCV and holder balances for affected tokens
console.log(`\nRebuilding data for ${affectedTokens.size} affected tokens...`);

for (const tokenAddr of affectedTokens) {
  console.log(`\n  Rebuilding ${tokenAddr}...`);

  // Get all trades for this token
  const tradeIds = await redisCmd("ZRANGE", `op:idx:trade:token:${tokenAddr}`, "0", "-1");
  if (!tradeIds || tradeIds.length === 0) {
    console.log(`    No trades found, skipping.`);
    continue;
  }

  // Read all trade data
  const tradeCmds = tradeIds.map((id) => ["HGETALL", `op:trade:${id}`]);
  const trades = [];
  for (let i = 0; i < tradeCmds.length; i += 50) {
    const batch = tradeCmds.slice(i, i + 50);
    const results = await redisPipeline(batch);
    trades.push(...results);
  }

  // Rebuild holder balances
  await redisPipeline([
    ["DEL", `op:holders:bal:${tokenAddr}`],
    ["DEL", `op:holders:${tokenAddr}`],
  ]);

  for (const trade of trades) {
    if (!trade || !trade.traderAddress || !trade.tokenAmount || !trade.type) continue;
    const amount = Number(trade.tokenAmount);
    if (trade.type === "buy") {
      await redisPipeline([
        ["ZINCRBY", `op:holders:bal:${tokenAddr}`, amount.toString(), trade.traderAddress],
        ["SADD", `op:holders:${tokenAddr}`, trade.traderAddress],
      ]);
    } else {
      const newScore = await redisCmd("ZINCRBY", `op:holders:bal:${tokenAddr}`, (-amount).toString(), trade.traderAddress);
      if (Number(newScore) <= 0) {
        await redisPipeline([
          ["ZREM", `op:holders:bal:${tokenAddr}`, trade.traderAddress],
          ["SREM", `op:holders:${tokenAddr}`, trade.traderAddress],
        ]);
      }
    }
  }

  const holderCount = await redisCmd("SCARD", `op:holders:${tokenAddr}`);
  console.log(`    Holders rebuilt: ${holderCount}`);

  // Rebuild OHLCV: delete existing candles, replay trades
  const timeframes = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
  for (const tf of Object.keys(timeframes)) {
    const idxKey = `op:ohlcv:idx:${tokenAddr}:${tf}`;
    const buckets = await redisCmd("ZRANGE", idxKey, "0", "-1");
    if (buckets && buckets.length > 0) {
      const delCmds = buckets.map((b) => ["DEL", `op:ohlcv:${tokenAddr}:${tf}:${b}`]);
      delCmds.push(["DEL", idxKey]);
      await redisPipeline(delCmds);
    }
  }

  // Replay trades into OHLCV
  let ohlcvCount = 0;
  for (const trade of trades) {
    if (!trade || !trade.pricePerToken || !trade.btcAmount || !trade.createdAt) continue;
    const price = parseFloat(trade.pricePerToken);
    const volume = parseInt(trade.btcAmount);
    if (price <= 0 || volume <= 0) continue;
    const timestampSec = Math.floor(new Date(trade.createdAt).getTime() / 1000);

    for (const [tf, interval] of Object.entries(timeframes)) {
      const bucket = Math.floor(timestampSec / interval) * interval;
      const candleKey = `op:ohlcv:${tokenAddr}:${tf}:${bucket}`;
      const idxKey = `op:ohlcv:idx:${tokenAddr}:${tf}`;

      // Atomic OHLCV update via Lua
      const script = `
        local key = KEYS[1]
        local price = tonumber(ARGV[1])
        local volume = tonumber(ARGV[2])
        local exists = redis.call('EXISTS', key)
        if exists == 0 then
          redis.call('HSET', key, 'o', price, 'h', price, 'l', price, 'c', price, 'v', volume)
        else
          local h = tonumber(redis.call('HGET', key, 'h'))
          local l = tonumber(redis.call('HGET', key, 'l'))
          if price > h then redis.call('HSET', key, 'h', price) end
          if price < l then redis.call('HSET', key, 'l', price) end
          redis.call('HSET', key, 'c', price)
          redis.call('HINCRBY', key, 'v', volume)
        end
        return 1
      `;
      await redisPipeline([
        ["EVAL", script, "1", candleKey, price.toString(), volume.toString()],
        ["ZADD", idxKey, bucket.toString(), bucket.toString()],
      ]);
    }
    ohlcvCount++;
  }

  console.log(`    OHLCV rebuilt: ${ohlcvCount} trades replayed`);
}

console.log("\nDone.");

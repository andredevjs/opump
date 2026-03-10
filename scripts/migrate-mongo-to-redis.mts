#!/usr/bin/env npx tsx
/**
 * One-time migration script: MongoDB → Upstash Redis
 *
 * Usage:
 *   MONGO_URL=mongodb://localhost:27017 MONGO_DB_NAME=opump \
 *   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
 *   UPSTASH_REDIS_REST_TOKEN=AXxx... \
 *   npx tsx scripts/migrate-mongo-to-redis.mts
 */

import { MongoClient } from "mongodb";
import { Redis } from "@upstash/redis";

const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "opump";
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error("Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

const redis = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
const mongo = new MongoClient(MONGO_URL);

async function main() {
  await mongo.connect();
  const db = mongo.db(MONGO_DB_NAME);

  // ─── Migrate tokens ─────────────────────────────────────
  console.log("Migrating tokens...");
  const tokens = await db.collection("tokens").find({}).toArray();
  console.log(`Found ${tokens.length} tokens`);

  for (const token of tokens) {
    const addr = token._id as string;
    const flat: Record<string, string> = {
      _id: addr,
      name: token.name || "",
      symbol: token.symbol || "",
      description: token.description || "",
      imageUrl: token.imageUrl || "",
      socials: JSON.stringify(token.socials || {}),
      creatorAddress: token.creatorAddress || "",
      contractAddress: token.contractAddress || addr,
      virtualBtcReserve: token.virtualBtcReserve || "0",
      virtualTokenSupply: token.virtualTokenSupply || "0",
      kConstant: token.kConstant || "0",
      realBtcReserve: token.realBtcReserve || "0",
      config: JSON.stringify(token.config || {}),
      status: token.status || "active",
      currentPriceSats: token.currentPriceSats || "0",
      volume24h: token.volume24h || "0",
      volumeTotal: token.volumeTotal || "0",
      marketCapSats: token.marketCapSats || "0",
      tradeCount: String(token.tradeCount || 0),
      holderCount: String(token.holderCount || 0),
      deployBlock: String(token.deployBlock || 0),
      deployTxHash: token.deployTxHash || "",
      graduatedAt: token.graduatedAt !== undefined ? String(token.graduatedAt) : "",
      createdAt: token.createdAt instanceof Date ? token.createdAt.toISOString() : String(token.createdAt || ""),
      updatedAt: token.updatedAt instanceof Date ? token.updatedAt.toISOString() : String(token.updatedAt || ""),
    };

    const pipe = redis.pipeline();

    // Store hash
    pipe.hset(`op:token:${addr}`, flat);

    // Sorted set indexes
    const status = token.status || "active";
    const statuses = [status, "all"];
    for (const s of statuses) {
      pipe.zadd(`op:idx:token:${s}:volume24h`, { score: parseFloat(token.volume24h || "0"), member: addr });
      pipe.zadd(`op:idx:token:${s}:marketCap`, { score: parseFloat(token.marketCapSats || "0"), member: addr });
      pipe.zadd(`op:idx:token:${s}:price`, { score: parseFloat(token.currentPriceSats || "0"), member: addr });
      pipe.zadd(`op:idx:token:${s}:newest`, { score: token.deployBlock || 0, member: addr });
    }

    // Creator index
    const createdAtMs = token.createdAt instanceof Date ? token.createdAt.getTime() : Date.now();
    pipe.zadd(`op:idx:token:creator:${token.creatorAddress}`, { score: createdAtMs, member: addr });

    // Search index
    const nameLower = (token.name || "").toLowerCase();
    const symbolLower = (token.symbol || "").toLowerCase();
    pipe.zadd("op:idx:token:search", { score: 0, member: `${nameLower}\0${addr}` });
    pipe.zadd("op:idx:token:search", { score: 0, member: `${symbolLower}\0${addr}` });

    await pipe.exec();
    console.log(`  Token: ${token.name} (${addr})`);
  }

  // ─── Migrate trades ──────────────────────────────────────
  console.log("\nMigrating trades...");
  const trades = await db.collection("trades").find({}).toArray();
  console.log(`Found ${trades.length} trades`);

  // Process in batches of 50 to avoid oversized pipelines
  for (let i = 0; i < trades.length; i += 50) {
    const batch = trades.slice(i, i + 50);
    const pipe = redis.pipeline();

    for (const trade of batch) {
      const txHash = trade._id as string;
      const flat: Record<string, string> = {
        _id: txHash,
        tokenAddress: trade.tokenAddress || "",
        type: trade.type || "buy",
        traderAddress: trade.traderAddress || "",
        btcAmount: trade.btcAmount || "0",
        tokenAmount: trade.tokenAmount || "0",
        pricePerToken: trade.pricePerToken || "0",
        fees: JSON.stringify(trade.fees || {}),
        priceImpactBps: String(trade.priceImpactBps || 0),
        status: trade.status || "confirmed",
        blockNumber: trade.blockNumber !== undefined ? String(trade.blockNumber) : "",
        blockTimestamp: trade.blockTimestamp instanceof Date ? trade.blockTimestamp.toISOString() : (trade.blockTimestamp || ""),
        createdAt: trade.createdAt instanceof Date ? trade.createdAt.toISOString() : String(trade.createdAt || ""),
      };

      const createdAtMs = trade.createdAt instanceof Date ? trade.createdAt.getTime() : Date.now();

      pipe.hset(`op:trade:${txHash}`, flat);
      pipe.zadd(`op:idx:trade:token:${trade.tokenAddress}`, { score: createdAtMs, member: txHash });
      pipe.zadd(`op:idx:trade:trader:${trade.traderAddress}`, { score: createdAtMs, member: txHash });
    }

    await pipe.exec();
    console.log(`  Migrated trades ${i + 1}-${Math.min(i + 50, trades.length)}`);
  }

  // ─── Migrate platform stats ──────────────────────────────
  console.log("\nMigrating platform stats...");
  const stats = await db.collection("platform_stats").findOne({ _id: "current" });
  if (stats) {
    await redis.hset("op:stats", {
      totalTokens: stats.totalTokens || 0,
      totalGraduated: stats.totalGraduated || 0,
      totalVolumeSats: stats.totalVolumeSats || "0",
      totalTrades: stats.totalTrades || 0,
      lastBlockIndexed: stats.lastBlockIndexed || 0,
      updatedAt: new Date().toISOString(),
    });

    // Set the indexer last block
    await redis.set("op:indexer:lastBlock", stats.lastBlockIndexed || 0);
    console.log(`  Stats migrated. Last block: ${stats.lastBlockIndexed}`);
  } else {
    console.log("  No platform stats found.");
  }

  console.log("\nMigration complete!");
  await mongo.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

/**
 * OHLCV (candlestick) data operations — extracted from redis-queries.mts.
 * Handles candle updates and queries for all timeframes.
 */

import { getRedis } from "./redis.mts";

// ─── Key helpers ────────────────────────────────────────────

const OHLCV_KEY = (tokenAddr: string, tf: string, bucket: number) => `op:ohlcv:${tokenAddr}:${tf}:${bucket}`;
const OHLCV_INDEX = (tokenAddr: string, tf: string) => `op:ohlcv:idx:${tokenAddr}:${tf}`;

export const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

const TIMEFRAME_TTL: Record<string, number> = {
  "1m": 2 * 86400,
  "5m": 7 * 86400,
  "15m": 30 * 86400,
  "1h": 90 * 86400,
  "4h": 180 * 86400,
  "1d": 0, // no expiry
};

/**
 * Update OHLCV candles for a trade across all timeframes.
 *
 * @param completionKey  Optional Redis key to SET atomically in the
 *   same pipeline.  Used as a per-trade completion marker so that
 *   crash-recovery retriers can skip an effect that already landed.
 */
export async function updateOHLCV(tokenAddress: string, priceSats: number, volumeSats: number, timestampSec: number, completionKey?: string): Promise<void> {
  const redis = getRedis();

  // Lua script for atomic OHLCV update
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

  // Batch all timeframe operations into a single pipeline
  const pipe = redis.pipeline();
  for (const [tf, interval] of Object.entries(TIMEFRAME_SECONDS)) {
    const bucket = Math.floor(timestampSec / interval) * interval;
    const candleKey = OHLCV_KEY(tokenAddress, tf, bucket);
    const indexKey = OHLCV_INDEX(tokenAddress, tf);

    pipe.eval(script, [candleKey], [priceSats.toString(), volumeSats.toString()]);

    // Set TTL if applicable
    const ttl = TIMEFRAME_TTL[tf];
    if (ttl > 0) {
      pipe.expire(candleKey, ttl);
    }

    // Add to candle index
    pipe.zadd(indexKey, { score: bucket, member: String(bucket) });
  }
  // Completion marker in the same pipeline — either the whole batch
  // (including the marker) reaches the server, or none of it does.
  if (completionKey) {
    pipe.set(completionKey, "1", { ex: 3600 });
  }
  await pipe.exec();
}

/**
 * Get OHLCV candles for a token and timeframe.
 */
export async function getOHLCV(tokenAddress: string, timeframe: string, limit: number): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
  const redis = getRedis();
  const indexKey = OHLCV_INDEX(tokenAddress, timeframe);

  // Get the most recent `limit` buckets
  const buckets: string[] = await redis.zrange(indexKey, 0, limit - 1, { rev: true });
  if (buckets.length === 0) return [];

  // Reverse to get chronological order
  buckets.reverse();

  const pipe = redis.pipeline();
  for (const bucket of buckets) {
    pipe.hgetall(OHLCV_KEY(tokenAddress, timeframe, parseInt(bucket)));
  }
  const results = await pipe.exec();

  const candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
  for (let i = 0; i < buckets.length; i++) {
    const raw = results[i] as Record<string, string> | null;
    if (raw && raw.o !== undefined) {
      candles.push({
        time: parseInt(buckets[i]),
        open: parseFloat(raw.o),
        high: parseFloat(raw.h),
        low: parseFloat(raw.l),
        close: parseFloat(raw.c),
        volume: parseFloat(raw.v),
      });
    }
  }

  return candles;
}

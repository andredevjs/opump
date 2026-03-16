import type { Config, Context } from "@netlify/functions";
import { json, corsHeaders } from "./_shared/response.mts";
import { getRedis } from "./_shared/redis.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const checks: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // 1. Env vars present (values redacted)
  checks.env = {
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    OPNET_RPC_URL: process.env.OPNET_RPC_URL || "(not set)",
    FRONTEND_URL: process.env.FRONTEND_URL || "(not set)",
  };

  // 2. Redis connectivity
  let redis;
  try {
    redis = getRedis();
    const pong = await redis.ping();
    checks.redis = { status: "ok", ping: pong };
  } catch (err) {
    checks.redis = { status: "error", message: err instanceof Error ? err.message : String(err) };
    return json({ status: "unhealthy", checks }, 503);
  }

  // 3. Data presence — count tokens, trades, indexer state
  try {
    const pipe = redis.pipeline();
    pipe.zcard("op:idx:token:all:newest");      // total tokens
    pipe.zcard("op:idx:token:active:newest");    // active tokens
    pipe.get("op:indexer:lastBlock");            // last indexed block
    pipe.get("op:indexer:lock");                 // indexer lock
    pipe.hgetall("op:stats");                    // platform stats

    const [totalTokens, activeTokens, lastBlock, lock, stats] = await pipe.exec();

    checks.data = {
      totalTokens,
      activeTokens,
      indexerLastBlock: lastBlock ?? "(never run)",
      indexerLock: lock ?? "(none)",
      stats: stats ?? "(empty)",
    };

    // 4. If there are tokens, check a sample token's trades
    if (typeof totalTokens === "number" && totalTokens > 0) {
      const sampleAddresses = await redis.zrange("op:idx:token:all:newest", 0, 0, { rev: true }) as string[];
      if (sampleAddresses.length > 0) {
        const addr = sampleAddresses[0];
        const tradeCount = await redis.zcard(`op:idx:trade:token:${addr}`);
        const tokenData = await redis.hgetall(`op:token:${addr}`);
        checks.sampleToken = {
          address: addr,
          tradeCount,
          hasData: !!tokenData && Object.keys(tokenData).length > 0,
          fields: tokenData ? Object.keys(tokenData) : [],
        };
      }
    }
  } catch (err) {
    checks.data = { status: "error", message: err instanceof Error ? err.message : String(err) };
  }

  const healthy = checks.redis && (checks.redis as { status: string }).status === "ok";
  return json({ status: healthy ? "healthy" : "unhealthy", checks });
};

export const config: Config = {
  path: "/api/health/debug",
  method: ["GET", "OPTIONS"],
};

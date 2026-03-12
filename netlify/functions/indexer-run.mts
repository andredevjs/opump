/**
 * HTTP-triggered indexer — works on deploy previews where scheduled functions don't run.
 * POST /api/v1/indexer/run — processes up to 10 blocks per call.
 * GET  /api/v1/indexer/run — returns current indexer state (debug).
 */

import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { runIndexer } from "./_shared/indexer-core.mts";
import { getLastBlockIndexed, getStats, getToken, getHolderCount } from "./_shared/redis-queries.mts";
import { getRedis } from "./_shared/redis.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET — return indexer debug state
  if (req.method === "GET") {
    try {
      const redis = getRedis();
      const lastBlock = await getLastBlockIndexed();
      const stats = await getStats();
      const knownTokenAddrs: string[] = await redis.zrange("op:idx:token:all:newest", 0, -1);

      // Per-token debug info
      const tokenDetails = [];
      for (const addr of knownTokenAddrs) {
        const token = await getToken(addr);
        const tradeCount = await redis.zcard(`op:idx:trade:token:${addr}`);
        const holderCount = await getHolderCount(addr);
        tokenDetails.push({
          address: addr,
          name: token?.name,
          symbol: token?.symbol,
          volume24h: token?.volume24h,
          volumeTotal: token?.volumeTotal,
          tradeCount,
          holderCount,
          currentPriceSats: token?.currentPriceSats,
          marketCapSats: token?.marketCapSats,
        });
      }

      return json({
        lastBlockIndexed: lastBlock,
        knownTokens: tokenDetails,
        knownTokenCount: knownTokenAddrs.length,
        stats,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : "Failed to get indexer state", 500, "InternalError");
    }
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  try {
    // Process up to 10 blocks per HTTP call (more than the scheduled 2)
    const result = await runIndexer(10);
    return json(result);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Indexer error", 500, "InternalError");
  }
};

// Routed via netlify.toml redirect: /api/v1/indexer/run → /.netlify/functions/indexer-run

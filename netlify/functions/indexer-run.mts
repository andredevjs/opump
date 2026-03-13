/**
 * HTTP-triggered indexer — works on deploy previews where scheduled functions don't run.
 * POST /api/v1/indexer/run — processes up to 10 blocks per call.
 * GET  /api/v1/indexer/run — returns current indexer state (debug).
 */

import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { runIndexer } from "./_shared/indexer-core.mts";
import { getLastBlockIndexed } from "./_shared/redis-queries.mts";
import { getRedis } from "./_shared/redis.mts";

const INDEXER_API_KEY = process.env.INDEXER_API_KEY || '';

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Authenticate all non-OPTIONS requests
  const authHeader = req.headers.get('Authorization');
  if (!INDEXER_API_KEY || authHeader !== `Bearer ${INDEXER_API_KEY}`) {
    return error('Unauthorized', 401, 'Unauthorized');
  }

  // GET — return basic indexer status (no sensitive data)
  if (req.method === "GET") {
    try {
      const redis = getRedis();
      const lastBlock = await getLastBlockIndexed();
      const tokenCount = await redis.zcard("op:idx:token:all:newest");

      return json({
        lastBlock,
        tokenCount,
        status: 'ok',
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

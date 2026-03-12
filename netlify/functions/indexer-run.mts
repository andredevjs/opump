/**
 * HTTP-triggered indexer — works on deploy previews where scheduled functions don't run.
 * POST /api/v1/indexer/run — processes up to 10 blocks per call.
 */

import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { runIndexer } from "./_shared/indexer-core.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
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

export const config: Config = {
  path: "/api/v1/indexer/run",
  method: ["POST", "OPTIONS"],
};

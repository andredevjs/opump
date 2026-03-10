import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getStats } from "./_shared/redis-queries.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const stats = await getStats();
    return json(stats);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Failed to fetch stats", 500, "InternalError");
  }
};

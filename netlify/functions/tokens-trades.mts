import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { listTradesForToken } from "./_shared/redis-queries.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const address = url.searchParams.get("address");

  if (!address) {
    return error("Missing address parameter", 400);
  }

  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  try {
    const result = await listTradesForToken(address, page, limit);

    return json({
      trades: result.trades,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

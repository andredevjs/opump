import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { listTokens } from "./_shared/redis-queries.mts";
import { handleCreateToken } from "./_shared/create-token.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Route POST to token creation
  if (req.method === "POST") {
    return handleCreateToken(req);
  }

  // GET — list tokens
  return handleList(req);
};

async function handleList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const sort = url.searchParams.get("sort") || "newest";
  const order = url.searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  try {
    const result = await listTokens({ status, sort, order, page, limit, search });

    return json({
      tokens: result.tokens,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    console.error("[Tokens] List error:", err instanceof Error ? err.message : err);
    return error("Internal error", 500, "InternalError");
  }
}

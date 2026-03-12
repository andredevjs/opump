import type { Context } from "@netlify/functions";
import { json, error, corsHeaders, getParam } from "./_shared/response.mts";
import { getToken } from "./_shared/redis-queries.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const url = new URL(req.url);
  const address = getParam(url, "address", 4); // /api/v1/tokens/:address

  if (!address) {
    return error("Missing address parameter", 400);
  }

  try {
    const token = await getToken(address);
    if (!token) {
      return error("Token not found", 404, "NotFound");
    }
    return json(token);
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken } from "./_shared/redis-queries.mts";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const address = context.params.address;

  if (!address) {
    return error("Missing address parameter", 400);
  }

  try {
    const token = await getToken(address);
    if (!token) {
      return error("Token not found", 404, "NotFound");
    }

    return json({
      currentPriceSats: token.currentPriceSats,
      virtualBtcReserve: token.virtualBtcReserve,
      virtualTokenSupply: token.virtualTokenSupply,
      realBtcReserve: token.realBtcReserve,
      isOptimistic: false,
      change24hBps: 0,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/tokens/:address/price",
  method: ["GET", "OPTIONS"],
};

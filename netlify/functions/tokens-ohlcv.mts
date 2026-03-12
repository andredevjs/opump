import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getOHLCV, TIMEFRAME_SECONDS } from "./_shared/redis-queries.mts";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const address = context.params.address;

  if (!address) {
    return error("Missing address parameter", 400);
  }

  const url = new URL(req.url);
  const timeframe = url.searchParams.get("timeframe") || "15m";
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") || "200", 10)));

  if (!TIMEFRAME_SECONDS[timeframe]) {
    return error(`Invalid timeframe "${timeframe}". Valid: 1m, 5m, 15m, 1h, 4h, 1d`, 400);
  }

  try {
    const candles = await getOHLCV(address, timeframe, limit);

    return json({
      candles,
      timeframe,
      tokenAddress: address,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/tokens/:address/ohlcv",
  method: ["GET", "OPTIONS"],
};

import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken, getOHLCV } from "./_shared/redis-queries.mts";

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

    let priceChange24hBps = 0;
    const currentPrice = Number(token.currentPriceSats);
    if (currentPrice > 0) {
      const candles = await getOHLCV(address, "1h", 25);
      if (candles.length > 0) {
        const oldPrice = candles[0].open;
        if (oldPrice > 0) {
          priceChange24hBps = Math.round(((currentPrice - oldPrice) / oldPrice) * 10000);
        }
      }
    }

    return json({ ...token, priceChange24hBps });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/tokens/:address",
  method: ["GET", "OPTIONS"],
};

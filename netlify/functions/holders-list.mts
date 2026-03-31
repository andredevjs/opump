import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken, getTopHolders, getHolderCount } from "./_shared/redis-queries.mts";
import { DEFAULT_MAX_SUPPLY } from "./_shared/constants.mts";

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

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") || "10");
    const limit = Math.min(50, Math.max(1, limitParam));

    const [holders, holderCount] = await Promise.all([
      getTopHolders(address, limit),
      getHolderCount(address),
    ]);

    const creatorAllocationTokens =
      (DEFAULT_MAX_SUPPLY * BigInt(token.config.creatorAllocationBps || 0)) / 10000n;
    const circulatingSupply =
      BigInt(token.currentSupplyOnCurve) + creatorAllocationTokens;

    const holdersWithPercent = circulatingSupply > 0n
      ? holders.map((h) => ({
          address: h.address,
          balance: h.balance,
          percent: Math.round(Number(BigInt(h.balance) * 10000n / circulatingSupply)) / 100,
        }))
      : [];

    return json({
      holders: holdersWithPercent,
      holderCount,
      circulatingSupply: circulatingSupply.toString(),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/tokens/:address/holders",
  method: ["GET", "OPTIONS"],
};

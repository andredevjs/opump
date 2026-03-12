import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getTokensByCreator } from "./_shared/redis-queries.mts";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const address = context.params.address;

  if (!address) {
    return error("Missing address parameter", 400);
  }

  try {
    const tokens = await getTokensByCreator(address);

    return json({
      address,
      tokens,
      total: tokens.length,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/profile/:address/tokens",
  method: ["GET", "OPTIONS"],
};

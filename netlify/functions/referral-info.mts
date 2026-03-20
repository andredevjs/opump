import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getReferralCode, getReferralEarnings, getReferrer } from "./_shared/referral-queries.mts";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "GET") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  const address = context.params?.address;
  if (!address) {
    return error("Missing address parameter", 400);
  }

  try {
    const [code, earnings, referredBy] = await Promise.all([
      getReferralCode(address),
      getReferralEarnings(address),
      getReferrer(address),
    ]);

    return json({
      code,
      earnings,
      referredBy,
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/referral/:address",
  method: ["GET", "OPTIONS"],
};

import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getCodeInfo, getReferrer, linkWalletToReferrer } from "./_shared/referral-queries.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  let body: { walletAddress?: string; referralCode?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!body.walletAddress || !body.referralCode) {
    return error("Missing required fields: walletAddress, referralCode", 400);
  }

  const code = body.referralCode.toUpperCase();

  try {
    // Validate the referral code exists
    const codeInfo = await getCodeInfo(code);
    if (!codeInfo) {
      return error("Invalid referral code", 404, "NotFound");
    }

    // Reject self-referral
    if (codeInfo.wallet === body.walletAddress) {
      return error("Cannot use your own referral code", 400, "SelfReferral");
    }

    // Check if already linked
    const existingReferrer = await getReferrer(body.walletAddress);
    if (existingReferrer) {
      return json({ ok: true, referrerAddress: existingReferrer });
    }

    // Link wallet to referrer
    await linkWalletToReferrer(body.walletAddress, codeInfo.wallet);

    return json({ ok: true, referrerAddress: codeInfo.wallet });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/referral/link",
  method: ["POST", "OPTIONS"],
};

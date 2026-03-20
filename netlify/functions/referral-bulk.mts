import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getReferralCode, createReferralCode, generateCode } from "./_shared/referral-queries.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return error("ADMIN_SECRET not configured", 500, "ConfigError");
  }

  let body: { wallets?: string[]; secret?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!body.secret || body.secret !== adminSecret) {
    return error("Unauthorized", 401, "Unauthorized");
  }

  if (!body.wallets || !Array.isArray(body.wallets) || body.wallets.length === 0) {
    return error("Missing or empty wallets array", 400);
  }

  const codes: { wallet: string; code: string }[] = [];
  let created = 0;
  let skipped = 0;

  for (const wallet of body.wallets) {
    if (!wallet || typeof wallet !== "string") {
      skipped++;
      continue;
    }

    // Check if wallet already has a code
    const existing = await getReferralCode(wallet);
    if (existing) {
      codes.push({ wallet, code: existing });
      skipped++;
      continue;
    }

    // Generate a unique code (retry on collision)
    let code = generateCode();
    let attempts = 0;
    while (attempts < 5) {
      const { getCodeInfo } = await import("./_shared/referral-queries.mts");
      const collision = await getCodeInfo(code);
      if (!collision) break;
      code = generateCode();
      attempts++;
    }

    await createReferralCode(wallet, code);
    codes.push({ wallet, code });
    created++;
  }

  return json({ created, skipped, codes });
};

export const config: Config = {
  path: "/api/v1/referral/bulk",
  method: ["POST", "OPTIONS"],
};

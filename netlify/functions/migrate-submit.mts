/**
 * POST /api/v1/migrate — accept a migration submission from the frontend
 * immediately after broadcast, updating Redis so the UI reflects the
 * migration in progress without waiting for block confirmation.
 */

import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken, startMigration } from "./_shared/redis-queries.mts";

interface MigrateSubmitBody {
  tokenAddress: string;
  txHash: string;
  recipientAddress: string;
}

function isValidBody(body: unknown): body is MigrateSubmitBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.tokenAddress === "string" && b.tokenAddress.length > 0 &&
    typeof b.txHash === "string" && b.txHash.length > 0 &&
    typeof b.recipientAddress === "string" && b.recipientAddress.length > 0
  );
}

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  if (!isValidBody(body)) {
    return error("Missing required fields: tokenAddress, txHash, recipientAddress", 400);
  }

  try {
    const token = await getToken(body.tokenAddress);
    if (!token) {
      return error("Token not found", 404, "NotFound");
    }

    if (token.status !== "graduated") {
      return error(`Token is not graduated (status: ${token.status})`, 400, "InvalidStatus");
    }

    // Optimistically mark as migrating (mempool-first)
    await startMigration(body.tokenAddress, body.txHash);

    console.log(`[migrate-submit] Token ${body.tokenAddress} migration started, tx: ${body.txHash}`);

    return json({ ok: true, txHash: body.txHash });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/migrate",
  method: ["POST", "OPTIONS"],
};

/**
 * POST /api/v1/trades — accept a trade submission from the frontend
 * immediately after broadcast, writing it to Redis so all users see it
 * without waiting for the indexer to scan the block.
 *
 * The indexer will later overwrite the record with on-chain data (block
 * number, timestamp, confirmed status). Duplicate _id (txHash) is safe
 * because saveTrade uses HSET which is an upsert.
 */

import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { saveTrade, updateOHLCV, updateToken } from "./_shared/redis-queries.mts";
import type { TradeDocument } from "./_shared/constants.mts";

interface TradeSubmitBody {
  txHash: string;
  tokenAddress: string;
  type: "buy" | "sell";
  traderAddress: string;
  btcAmount: string;
  tokenAmount: string;
  pricePerToken: string;
}

function isValidBody(body: unknown): body is TradeSubmitBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.txHash === "string" && b.txHash.length > 0 &&
    typeof b.tokenAddress === "string" && b.tokenAddress.length > 0 &&
    (b.type === "buy" || b.type === "sell") &&
    typeof b.traderAddress === "string" && b.traderAddress.length > 0 &&
    typeof b.btcAmount === "string" &&
    typeof b.tokenAmount === "string" &&
    typeof b.pricePerToken === "string"
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
    return error("Missing required fields: txHash, tokenAddress, type, traderAddress, btcAmount, tokenAmount, pricePerToken", 400);
  }

  try {
    const trade: TradeDocument = {
      _id: body.txHash,
      tokenAddress: body.tokenAddress,
      type: body.type,
      traderAddress: body.traderAddress,
      btcAmount: body.btcAmount,
      tokenAmount: body.tokenAmount,
      pricePerToken: body.pricePerToken,
      fees: { platform: "0", creator: "0", minter: "0", flywheel: "0" },
      priceImpactBps: 0,
      status: "pending",
      createdAt: new Date(),
    };

    await saveTrade(trade);

    // Write OHLCV candle optimistically so the chart updates immediately
    // (mempool-first). The indexer guards its own updateOHLCV with isNew
    // to avoid double-counting volume for the same trade.
    const priceSats = Number(body.pricePerToken);
    const volumeSats = Number(body.btcAmount);
    const timestampSec = Math.floor(Date.now() / 1000);
    await updateOHLCV(trade.tokenAddress, priceSats, volumeSats, timestampSec);

    // Update token's currentPriceSats optimistically so the price and detail
    // endpoints reflect the trade immediately (mempool-first). The indexer's
    // syncTokenReserves will later overwrite with the exact on-chain price.
    await updateToken(trade.tokenAddress, { currentPriceSats: body.pricePerToken });

    return json({ ok: true, txHash: body.txHash });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/trades",
  method: ["POST", "OPTIONS"],
};

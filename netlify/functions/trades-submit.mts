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
import { saveTrade, updateOHLCV, updateToken, getToken, getHolderCount } from "./_shared/redis-queries.mts";
import type { TradeDocument } from "./_shared/constants.mts";
import { INITIAL_VIRTUAL_TOKEN_SUPPLY, PRICE_PRECISION, PRICE_DISPLAY_DIVISOR, TOTAL_FEE_BPS, FEE_DENOMINATOR } from "./_shared/constants.mts";

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
      fees: { platform: "0", creator: "0", flywheel: "0" },
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

    // --- Optimistic token stats (mempool-first) ---
    // Update price, volume, trade counts, holder count, and marketCap so the
    // token list and detail pages reflect the trade immediately. The indexer
    // recomputes all of these from source data on every run (~1 min), so any
    // drift from approximation is short-lived.
    const token = await getToken(trade.tokenAddress);
    if (token) {
      const btcAmountBig = BigInt(body.btcAmount);

      // Approximate marketCap from optimistic price
      const scaledPrice = BigInt(Math.round(Number(body.pricePerToken) * PRICE_DISPLAY_DIVISOR));
      const marketCapSats = (scaledPrice * INITIAL_VIRTUAL_TOKEN_SUPPLY / PRICE_PRECISION).toString();

      // --- Optimistic reserve updates (mempool-first) ---
      // Compute new reserves using the bonding curve AMM formula so the
      // graduation progress bar and bonding curve visual update immediately.
      const curVBtc = BigInt(token.virtualBtcReserve);
      const curVToken = BigInt(token.virtualTokenSupply);
      const curRealBtc = BigInt(token.realBtcReserve);
      const k = BigInt(token.kConstant);

      let newVBtc: bigint;
      let newVToken: bigint;
      let newRealBtc: bigint;

      if (body.type === "buy") {
        const fee = (btcAmountBig * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
        const btcAfterFee = btcAmountBig - fee;
        newVBtc = curVBtc + btcAfterFee;
        newVToken = k / newVBtc;
        newRealBtc = curRealBtc + btcAfterFee;
      } else {
        const tokensIn = BigInt(body.tokenAmount);
        newVToken = curVToken + tokensIn;
        newVBtc = k / newVToken;
        const btcOutBeforeFee = curVBtc - newVBtc;
        newRealBtc = curRealBtc - btcOutBeforeFee;
      }

      await updateToken(trade.tokenAddress, {
        currentPriceSats: body.pricePerToken,
        tradeCount: (token.tradeCount || 0) + 1,
        tradeCount24h: (token.tradeCount24h || 0) + 1,
        volume24h: (BigInt(token.volume24h || "0") + btcAmountBig).toString(),
        volumeTotal: (BigInt(token.volumeTotal || "0") + btcAmountBig).toString(),
        holderCount: await getHolderCount(trade.tokenAddress),
        marketCapSats,
        virtualBtcReserve: newVBtc.toString(),
        virtualTokenSupply: newVToken.toString(),
        realBtcReserve: newRealBtc.toString(),
        status: token.status,
      });
    } else {
      // Fallback: at minimum update the price
      await updateToken(trade.tokenAddress, { currentPriceSats: body.pricePerToken });
    }

    // --- Referral earnings (fire-and-forget) ---
    // Credit referrer if the trader was referred. Errors must NOT fail the trade.
    try {
      const { getReferrer, creditReferralEarnings } = await import("./_shared/referral-queries.mts");
      const referrer = await getReferrer(body.traderAddress);
      if (referrer) {
        const btcAmountBig = BigInt(body.btcAmount);
        const platformFee = (btcAmountBig * 100n) / 10_000n; // 1% of trade
        const referralReward = (platformFee * 10n) / 100n;    // 10% of platform fee
        if (referralReward > 0n) {
          await creditReferralEarnings(referrer, referralReward.toString());
        }
      }
    } catch (refErr) {
      console.warn("[trades-submit] Referral credit failed (non-fatal):", refErr instanceof Error ? refErr.message : refErr);
    }

    return json({ ok: true, txHash: body.txHash });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/trades",
  method: ["POST", "OPTIONS"],
};

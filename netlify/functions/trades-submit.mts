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
import { saveTrade, updateOHLCV, updateToken, getToken, getHolderCount, graduateToken } from "./_shared/redis-queries.mts";
import type { TradeDocument } from "./_shared/constants.mts";
import { PRICE_PRECISION, TOTAL_FEE_BPS, FEE_DENOMINATOR, GRADUATION_THRESHOLD_SATS, DEFAULT_MAX_SUPPLY, TOKEN_UNITS_PER_TOKEN } from "./_shared/constants.mts";
import { calculatePrice } from "./_shared/bonding-curve.mts";

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

  // Reject trades for tokens that have graduated or are migrating
  const preCheck = await getToken(body.tokenAddress);
  if (preCheck && (preCheck.status === "graduated" || preCheck.status === "migrating" || preCheck.status === "migrated")) {
    return error("Token has graduated — bonding curve trading is closed", 400, "TokenGraduated");
  }
  // Reject trades for tokens not yet confirmed on-chain
  if (preCheck && (!preCheck.deployBlock || preCheck.deployBlock === 0)) {
    return error("Token not yet confirmed on-chain. Trading opens after confirmation.", 400, "NotConfirmed");
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

      // --- Optimistic reserve updates (mempool-first) ---
      // Compute new supply using the exponential bonding curve so the
      // graduation progress bar and bonding curve visual update immediately.
      const curSupply = BigInt(token.currentSupplyOnCurve);
      const curRealBtc = BigInt(token.realBtcReserve);
      const aScaled = BigInt(token.aScaled);
      const bScaled = BigInt(token.bScaled);

      let newSupply: bigint;
      let newRealBtc: bigint;

      if (body.type === "buy") {
        const fee = (btcAmountBig * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
        const btcAfterFee = btcAmountBig - fee;
        const tokensOut = BigInt(body.tokenAmount);
        newSupply = curSupply + tokensOut;
        newRealBtc = curRealBtc + btcAfterFee;
      } else {
        const tokensIn = BigInt(body.tokenAmount);
        newSupply = curSupply - tokensIn;
        // Approximate gross payout: net / (1 - feeRate)
        const grossBtcOut = (btcAmountBig * FEE_DENOMINATOR) / (FEE_DENOMINATOR - TOTAL_FEE_BPS);
        newRealBtc = curRealBtc - grossBtcOut;
      }

      // Compute new price and market cap from the exponential curve
      const newPriceScaled = calculatePrice(aScaled, bScaled, newSupply);
      const marketCapSats = (newPriceScaled * DEFAULT_MAX_SUPPLY / (PRICE_PRECISION * TOKEN_UNITS_PER_TOKEN)).toString();

      // Check if this buy caused graduation (mempool-first)
      let newStatus = token.status;
      if (body.type === "buy" && token.status === "active" && newRealBtc >= GRADUATION_THRESHOLD_SATS) {
        newStatus = "graduated";
      }

      await updateToken(trade.tokenAddress, {
        currentPriceSats: body.pricePerToken,
        tradeCount: (token.tradeCount || 0) + 1,
        tradeCount24h: (token.tradeCount24h || 0) + 1,
        volume24h: (BigInt(token.volume24h || "0") + btcAmountBig).toString(),
        volumeTotal: (BigInt(token.volumeTotal || "0") + btcAmountBig).toString(),
        holderCount: await getHolderCount(trade.tokenAddress),
        marketCapSats,
        currentSupplyOnCurve: newSupply.toString(),
        realBtcReserve: newRealBtc.toString(),
        status: newStatus,
      });

      // Move token to graduated indexes if status just changed
      if (newStatus === "graduated" && token.status === "active") {
        await graduateToken(trade.tokenAddress, 0);
      }
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

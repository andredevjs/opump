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
import { saveTrade, updateOHLCV, updateToken, getToken, getHolderCount, graduateToken, compareAndSwapReserves, stageTrade, getStagedTrade, clearStagedTrade } from "./_shared/redis-queries.mts";
import type { TradeDocument } from "./_shared/constants.mts";
import {
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
  GRADUATION_THRESHOLD_SATS,
  DEFAULT_MAX_SUPPLY,
  TOKEN_UNITS_PER_TOKEN,
} from "./_shared/constants.mts";
import { BondingCurveSimulator } from "./_shared/bonding-curve.mts";

interface TradeSubmitBody {
  txHash: string;
  tokenAddress: string;
  type: "buy" | "sell";
  traderAddress: string;
  btcAmount?: string;
  tokenAmount?: string;
  pricePerToken?: string;
}

function isValidBody(body: unknown): body is TradeSubmitBody {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  const hasCommonFields =
    typeof b.txHash === "string" && b.txHash.length > 0 &&
    typeof b.tokenAddress === "string" && b.tokenAddress.length > 0 &&
    (b.type === "buy" || b.type === "sell") &&
    typeof b.traderAddress === "string" && b.traderAddress.length > 0;

  if (!hasCommonFields) return false;

  if (b.type === "buy") {
    return typeof b.btcAmount === "string" && b.btcAmount.length > 0;
  }

  return (
    typeof b.tokenAmount === "string" &&
    b.tokenAmount.length > 0
  );
}

const simulator = new BondingCurveSimulator();

function toDisplayPrice(scaled: bigint): string {
  return (Number(scaled) / PRICE_DISPLAY_DIVISOR).toString();
}

// Safe for OPump price range (sub-BTC values). For prices above ~9e15 sats
// (~90M BTC) Number() would lose precision — not reachable on this curve.
function toSpotPrice(scaled: bigint): string {
  return (Number(scaled) / Number(PRICE_PRECISION)).toString();
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
    return error("Missing required fields: txHash, tokenAddress, type, traderAddress, plus btcAmount for buys or tokenAmount for sells", 400);
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
    if (!preCheck) {
      return error("Token not found", 404, "NotFound");
    }

    const MAX_RETRIES = 5;
    let token = preCheck;
    let trade: TradeDocument | null = null;
    let volumeDelta = 0n;
    let newStatus = token.status;
    let casResult: "ok" | "version_mismatch" | "trade_already_applied" = "version_mismatch";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Re-read token on retry to get fresh reserves + version
      if (attempt > 0) {
        const fresh = await getToken(body.tokenAddress);
        if (!fresh) return error("Token not found", 404, "NotFound");
        if (fresh.status === "graduated" || fresh.status === "migrating" || fresh.status === "migrated") {
          return error("Token has graduated — bonding curve trading is closed", 400, "TokenGraduated");
        }
        token = fresh;
      }

      const reserves = {
        currentSupplyOnCurve: BigInt(token.currentSupplyOnCurve),
        realBtcReserve: BigInt(token.realBtcReserve),
        aScaled: BigInt(token.aScaled),
        bScaled: BigInt(token.bScaled),
      };

      newStatus = token.status;

      let currentPriceSats: string;
      let marketCapSats: string;
      let currentSupplyOnCurve: string;
      let realBtcReserve: string;

      if (body.type === "buy") {
        const btcAmount = BigInt(body.btcAmount!);
        const result = simulator.simulateBuy(reserves, btcAmount, BigInt(token.config.buyTaxBps || 0));
        const effectivePriceScaled = result.tokensOut > 0n
          ? (btcAmount * PRICE_PRECISION) / result.tokensOut
          : 0n;

        trade = {
          _id: body.txHash,
          tokenAddress: body.tokenAddress,
          type: "buy",
          traderAddress: body.traderAddress,
          btcAmount: btcAmount.toString(),
          tokenAmount: result.tokensOut.toString(),
          pricePerToken: toDisplayPrice(effectivePriceScaled),
          fees: {
            platform: result.fees.platform.toString(),
            creator: result.fees.creator.toString(),
            flywheel: result.fees.flywheel.toString(),
          },
          priceImpactBps: result.priceImpactBps,
          status: "pending",
          createdAt: new Date(),
        };

        currentPriceSats = toSpotPrice(result.newPriceSats);
        marketCapSats = (result.newPriceSats * DEFAULT_MAX_SUPPLY / (PRICE_PRECISION * TOKEN_UNITS_PER_TOKEN)).toString();
        currentSupplyOnCurve = result.newReserves.currentSupplyOnCurve.toString();
        realBtcReserve = result.newReserves.realBtcReserve.toString();
        volumeDelta = btcAmount;

        if (token.status === "active" && result.newReserves.realBtcReserve >= GRADUATION_THRESHOLD_SATS) {
          newStatus = "graduated";
        }
      } else {
        const tokenAmount = BigInt(body.tokenAmount!);
        const result = simulator.simulateSell(reserves, tokenAmount, BigInt(token.config.sellTaxBps || 0));
        const effectivePriceScaled = tokenAmount > 0n
          ? (result.btcOut * PRICE_PRECISION) / tokenAmount
          : 0n;

        trade = {
          _id: body.txHash,
          tokenAddress: body.tokenAddress,
          type: "sell",
          traderAddress: body.traderAddress,
          btcAmount: result.btcOut.toString(),
          tokenAmount: tokenAmount.toString(),
          pricePerToken: toDisplayPrice(effectivePriceScaled),
          fees: {
            platform: result.fees.platform.toString(),
            creator: result.fees.creator.toString(),
            flywheel: result.fees.flywheel.toString(),
          },
          priceImpactBps: result.priceImpactBps,
          status: "pending",
          createdAt: new Date(),
        };

        currentPriceSats = toSpotPrice(result.newPriceSats);
        marketCapSats = (result.newPriceSats * DEFAULT_MAX_SUPPLY / (PRICE_PRECISION * TOKEN_UNITS_PER_TOKEN)).toString();
        currentSupplyOnCurve = result.newReserves.currentSupplyOnCurve.toString();
        realBtcReserve = result.newReserves.realBtcReserve.toString();
        volumeDelta = BigInt(trade.btcAmount);
      }

      // Stage trade data before CAS so we can recover if the function
      // crashes between CAS and side effects. NX ensures only the first
      // (correct) computation is preserved across retries.
      await stageTrade(body.txHash, JSON.stringify({
        trade: { ...trade, createdAt: trade.createdAt.toISOString() },
        volumeDelta: volumeDelta.toString(),
        newStatus,
      }));

      // Atomic: check dedup + check version + write reserves in one Lua call
      casResult = await compareAndSwapReserves(body.tokenAddress, token.reserveVersion, body.txHash, {
        currentPriceSats,
        currentSupplyOnCurve,
        realBtcReserve,
        marketCapSats,
        status: newStatus,
      });

      if (casResult === "ok") break;
      if (casResult === "trade_already_applied") break;
      // version_mismatch → clear staged trade so next attempt writes fresh
      await clearStagedTrade(body.txHash);
      console.warn(`[trades-submit] CAS retry ${attempt + 1}/${MAX_RETRIES} for ${body.tokenAddress}`);
    }

    // Recover staged trade data when reserves were already applied but
    // side effects (saveTrade, OHLCV, stats, referral) may not have run.
    if (casResult === "trade_already_applied") {
      const staged = await getStagedTrade(body.txHash);
      if (!staged) {
        // Staged data expired — side effects were likely completed on the
        // original request, and the indexer will reconcile regardless.
        return json({ ok: true, txHash: body.txHash });
      }
      const recovered = JSON.parse(staged);
      trade = { ...recovered.trade, createdAt: new Date(recovered.trade.createdAt) } as TradeDocument;
      volumeDelta = BigInt(recovered.volumeDelta);
      newStatus = recovered.newStatus;
    } else if (casResult !== "ok" || !trade) {
      return error("Trade could not be applied — too much contention. Please retry.", 409, "Conflict");
    }

    const { isNew } = await saveTrade(trade);

    if (isNew) {
      // Read canonical price from the hash (CAS already wrote it) for OHLCV
      const canonicalToken = await getToken(trade.tokenAddress);
      const priceSats = Number(canonicalToken?.currentPriceSats || trade.pricePerToken);
      const volumeSats = Number(trade.btcAmount);
      const timestampSec = Math.floor(Date.now() / 1000);
      await updateOHLCV(trade.tokenAddress, priceSats, volumeSats, timestampSec);

      // Aggregate stats (trade counts, volume) are additive counters that
      // the indexer reconciles from trade history every cycle. No need for
      // CAS — slight drift from concurrent trades is acceptable.
      await updateToken(trade.tokenAddress, {
        tradeCount: (token.tradeCount || 0) + 1,
        tradeCount24h: (token.tradeCount24h || 0) + 1,
        volume24h: (BigInt(token.volume24h || "0") + volumeDelta).toString(),
        volumeTotal: (BigInt(token.volumeTotal || "0") + volumeDelta).toString(),
        holderCount: await getHolderCount(trade.tokenAddress),
      });

      // Move token to graduated indexes if status just changed
      if (newStatus === "graduated" && token.status === "active") {
        await graduateToken(trade.tokenAddress, 0);
      }
    }

    // --- Referral earnings (fire-and-forget) ---
    if (isNew) {
      try {
        const { getReferrer, creditReferralEarnings } = await import("./_shared/referral-queries.mts");
        const referrer = await getReferrer(body.traderAddress);
        if (referrer) {
          const platformFee = BigInt(trade.fees.platform);
          const referralReward = (platformFee * 10n) / 100n;
          if (referralReward > 0n) {
            await creditReferralEarnings(referrer, referralReward.toString());
          }
        }
      } catch (refErr) {
        console.warn("[trades-submit] Referral credit failed (non-fatal):", refErr instanceof Error ? refErr.message : refErr);
      }
    }

    // All side effects complete — clean up staging key
    await clearStagedTrade(body.txHash);

    return json({ ok: true, txHash: body.txHash });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/trades",
  method: ["POST", "OPTIONS"],
};

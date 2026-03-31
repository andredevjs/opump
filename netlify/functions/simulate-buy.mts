import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken } from "./_shared/redis-queries.mts";
import { BondingCurveSimulator } from "./_shared/bonding-curve.mts";
import { MIN_TRADE_SATS } from "./_shared/constants.mts";

const simulator = new BondingCurveSimulator();

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  let body: { tokenAddress?: string; btcAmountSats?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!body.tokenAddress || !body.btcAmountSats) {
    return error("Missing required fields: tokenAddress, btcAmountSats", 400);
  }

  let btcAmount: bigint;
  try {
    btcAmount = BigInt(body.btcAmountSats);
  } catch {
    return error("btcAmountSats must be a non-negative integer string", 400);
  }
  if (btcAmount < 0n) {
    return error("btcAmountSats must be non-negative", 400);
  }
  if (btcAmount < MIN_TRADE_SATS) {
    return error(`Minimum trade amount is ${MIN_TRADE_SATS} sats`, 400);
  }

  try {
    const token = await getToken(body.tokenAddress);
    if (!token) {
      return error("Token not found", 404, "NotFound");
    }
    if (token.status === "graduated") {
      return error("Token has graduated", 400);
    }

    const reserves = {
      currentSupplyOnCurve: BigInt(token.currentSupplyOnCurve),
      realBtcReserve: BigInt(token.realBtcReserve),
      aScaled: BigInt(token.aScaled),
      bScaled: BigInt(token.bScaled),
    };

    const result = simulator.simulateBuy(reserves, btcAmount, BigInt(token.config.buyTaxBps));

    return json({
      tokensOut: result.tokensOut.toString(),
      fees: {
        platform: result.fees.platform.toString(),
        creator: result.fees.creator.toString(),
        flywheel: result.fees.flywheel.toString(),
        total: result.fees.total.toString(),
      },
      priceImpactBps: result.priceImpactBps,
      newPriceSats: result.newPriceSats.toString(),
      effectivePriceSats: result.effectivePriceSats.toString(),
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Simulation failed", 400, "SimulationError");
  }
};

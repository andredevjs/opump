import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken } from "./_shared/redis-queries.mts";
import { BondingCurveSimulator } from "./_shared/bonding-curve.mts";

const simulator = new BondingCurveSimulator();

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  let body: { tokenAddress?: string; tokenAmount?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (!body.tokenAddress || !body.tokenAmount) {
    return error("Missing required fields: tokenAddress, tokenAmount", 400);
  }

  let tokenAmount: bigint;
  try {
    tokenAmount = BigInt(body.tokenAmount);
  } catch {
    return error("tokenAmount must be a non-negative integer string", 400);
  }
  if (tokenAmount <= 0n) {
    return error("tokenAmount must be positive", 400);
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
      virtualBtcReserve: BigInt(token.virtualBtcReserve),
      virtualTokenSupply: BigInt(token.virtualTokenSupply),
      kConstant: BigInt(token.kConstant),
      realBtcReserve: BigInt(token.realBtcReserve),
    };

    const result = simulator.simulateSell(reserves, tokenAmount, BigInt(token.config.sellTaxBps));

    return json({
      btcOut: result.btcOut.toString(),
      fees: {
        platform: result.fees.platform.toString(),
        creator: result.fees.creator.toString(),
        minter: result.fees.minter.toString(),
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

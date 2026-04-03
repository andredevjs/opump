/**
 * Thin wrapper — canonical implementation lives in shared/lib/bonding-curve.ts.
 * Re-exported here so existing function-layer imports continue to resolve.
 */
export {
  calculateBuyCost,
  calculateSellPayout,
  calculatePrice,
  maxTokensForBudget,
  deriveParams,
  BondingCurveSimulator,
} from "../../../shared/lib/bonding-curve.ts";

export type {
  Reserves,
  FeeBreakdown,
  BuySimulation,
  SellSimulation,
} from "../../../shared/lib/bonding-curve.ts";

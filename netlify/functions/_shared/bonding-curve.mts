/**
 * Exponential bonding curve simulator.
 *
 * Formula: Price(x) = a * e^(b*x)
 * Buy cost:   (a/b) * [e^(b*(x+dt)) - e^(b*x)]
 * Sell payout: (a/b) * [e^(b*x) - e^(b*(x-dt))]
 *
 * Parameters a, b are derived at deployment from curveSupply and graduationThreshold.
 * All internal math uses fixed-point bigint scaled by 10^18.
 */

import { expScaled, EXP_SCALE, LN_100_SCALED } from "./exp-math.mts";
import {
  TOTAL_FEE_BPS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  FEE_DENOMINATOR,
  MIN_TRADE_SATS,
  GRADUATION_THRESHOLD_SATS,
  PRICE_PRECISION,
  TOKEN_UNITS_PER_TOKEN,
  GRAD_SUPPLY_FRACTION_BPS,
} from "./constants.mts";

// ─── Types ────────────────────────────────────────────

export interface Reserves {
  currentSupplyOnCurve: bigint;  // token units on curve
  realBtcReserve: bigint;
  aScaled: bigint;               // a * 10^18
  bScaled: bigint;               // b * 10^18 (per whole token)
  curveSupply?: bigint;           // max tokens available on curve
  graduationThreshold?: bigint;
}

export interface FeeBreakdown {
  platform: bigint;
  creator: bigint;
  flywheel: bigint;
  total: bigint;
}

export interface BuySimulation {
  tokensOut: bigint;
  fees: FeeBreakdown;
  newReserves: Reserves;
  priceImpactBps: number;
  newPriceSats: bigint;
  effectivePriceSats: bigint;
}

export interface SellSimulation {
  btcOut: bigint;
  fees: FeeBreakdown;
  newReserves: Reserves;
  priceImpactBps: number;
  newPriceSats: bigint;
  effectivePriceSats: bigint;
}

// ─── Curve primitives ─────────────────────────────────

/**
 * Compute b*x in scaled form where x is in token units and b is per whole token.
 * Returns b*x * SCALE for use with expScaled().
 */
function bxScaled(bScaled: bigint, supplyUnits: bigint): bigint {
  // bScaled * supplyUnits / TOKEN_UNITS_PER_TOKEN
  return (bScaled * supplyUnits) / TOKEN_UNITS_PER_TOKEN;
}

/**
 * Buy cost in sats: ceil of integral.
 * Cost = (a/b) * [e^(b*(x+dt)) - e^(b*x)]
 */
export function calculateBuyCost(
  aScaled: bigint,
  bScaled: bigint,
  supplyUnits: bigint,
  deltaUnits: bigint,
): bigint {
  if (deltaUnits === 0n) return 0n;

  const bxAfter = bxScaled(bScaled, supplyUnits + deltaUnits);
  const bxBefore = bxScaled(bScaled, supplyUnits);

  const expAfter = expScaled(bxAfter);
  const expBefore = expScaled(bxBefore);
  const diff = expAfter - expBefore;

  // cost = (a/b) * diff / SCALE
  // = (aScaled * diff) / (bScaled * SCALE)
  const numerator = aScaled * diff;
  const denominator = bScaled * EXP_SCALE;

  // Ceil division: (num + denom - 1) / denom
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Sell payout in sats: floor of integral (protocol-favoring).
 * Payout = (a/b) * [e^(b*x) - e^(b*(x-dt))]
 */
export function calculateSellPayout(
  aScaled: bigint,
  bScaled: bigint,
  supplyUnits: bigint,
  deltaUnits: bigint,
): bigint {
  if (deltaUnits === 0n) return 0n;
  if (deltaUnits > supplyUnits) throw new Error("Sell exceeds supply on curve");

  const bxBefore = bxScaled(bScaled, supplyUnits);
  const bxAfter = bxScaled(bScaled, supplyUnits - deltaUnits);

  const expBefore = expScaled(bxBefore);
  const expAfter = expScaled(bxAfter);
  const diff = expBefore - expAfter;

  // payout = (a/b) * diff / SCALE  (floor division)
  return (aScaled * diff) / (bScaled * EXP_SCALE);
}

/**
 * Spot price at current supply: a * e^(b*x).
 * Returns price * PRICE_PRECISION (10^18).
 */
export function calculatePrice(
  aScaled: bigint,
  bScaled: bigint,
  supplyUnits: bigint,
): bigint {
  const bx = bxScaled(bScaled, supplyUnits);
  const expVal = expScaled(bx);
  // price * 10^18 = aScaled * expVal / SCALE
  return (aScaled * expVal) / EXP_SCALE;
}

/**
 * Max tokens that can be bought with `budgetSats`.
 * Uses analytical inverse for initial guess + binary search for exactness.
 */
export function maxTokensForBudget(
  aScaled: bigint,
  bScaled: bigint,
  supplyUnits: bigint,
  budgetSats: bigint,
  maxDelta: bigint,
): bigint {
  if (budgetSats <= 0n || maxDelta <= 0n) return 0n;

  // Initial guess from closed-form inverse:
  // dt = (1/b) * ln(b*budget/a + e^(bx)) - x
  let hi = approxTokensFromBudget(aScaled, bScaled, supplyUnits, budgetSats);
  if (hi <= 0n) hi = 1n;
  if (hi > maxDelta) hi = maxDelta;

  // Expand bracket if needed
  while (hi < maxDelta) {
    const cost = calculateBuyCost(aScaled, bScaled, supplyUnits, hi);
    if (cost > budgetSats) break;
    const next = hi * 2n;
    hi = next > maxDelta ? maxDelta : next;
    if (hi === maxDelta) break;
  }

  // Binary search: find max deltaUnits where cost <= budget
  let lo = 0n;
  let ans = 0n;

  while (lo <= hi) {
    const mid = lo + (hi - lo) / 2n;
    if (mid === 0n) {
      // Check if we can buy at least 1 unit
      const c = calculateBuyCost(aScaled, bScaled, supplyUnits, 1n);
      if (c <= budgetSats) { ans = 1n; lo = 2n; } else { break; }
      continue;
    }
    const cost = calculateBuyCost(aScaled, bScaled, supplyUnits, mid);
    if (cost <= budgetSats) {
      ans = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }

  return ans;
}

/**
 * Analytical inverse for initial bracket guess (buy).
 * dt = (1/b) * ln(b*budget/a + e^(bx)) - x
 * Uses native Math.log for speed (only needs to be approximate).
 */
function approxTokensFromBudget(
  aScaled: bigint,
  bScaled: bigint,
  supplyUnits: bigint,
  budgetSats: bigint,
): bigint {
  // Convert to floats for the approximation
  const a = Number(aScaled) / 1e18;
  const b = Number(bScaled) / 1e18;
  const x = Number(supplyUnits) / Number(TOKEN_UNITS_PER_TOKEN);
  const budget = Number(budgetSats);

  if (a <= 0 || b <= 0) return 0n;

  const ebx = Math.exp(b * x);
  const inner = (b / a) * budget + ebx;
  if (inner <= 0) return 0n;

  const x2 = (1 / b) * Math.log(inner);
  const dt = x2 - x;
  if (dt <= 0) return 0n;

  // Convert back to token units
  return BigInt(Math.floor(dt * Number(TOKEN_UNITS_PER_TOKEN)));
}

/**
 * Derive curve parameters (a, b) from curve supply and graduation threshold.
 *
 * Strategy: target 100x price increase when 80% of curve supply is sold.
 * b = ln(100) / x_grad   (per whole token)
 * a = gradThreshold * b / 99
 */
export function deriveParams(
  curveSupplyUnits: bigint,
  graduationThresholdSats: bigint,
): { aScaled: bigint; bScaled: bigint } {
  if (curveSupplyUnits <= 0n) throw new Error("curveSupply must be positive");
  if (graduationThresholdSats <= 0n) throw new Error("graduationThreshold must be positive");

  // x_grad in whole tokens = curveSupply * GRAD_FRACTION / 10000 / TOKEN_UNITS
  // But we need b per whole token, so:
  // x_grad_whole = curveSupplyUnits * GRAD_SUPPLY_FRACTION_BPS / (FEE_DENOMINATOR * TOKEN_UNITS_PER_TOKEN)
  // b = ln(100) / x_grad_whole
  //
  // In scaled form:
  // bScaled = LN_100_SCALED * FEE_DENOMINATOR * TOKEN_UNITS_PER_TOKEN / (curveSupplyUnits * GRAD_SUPPLY_FRACTION_BPS)
  const bScaled = (LN_100_SCALED * FEE_DENOMINATOR * TOKEN_UNITS_PER_TOKEN) /
    (curveSupplyUnits * GRAD_SUPPLY_FRACTION_BPS);

  // a = gradThreshold * b / 99
  // aScaled = gradThreshold * bScaled / 99
  // But we need aScaled = a * SCALE, and gradThreshold is in sats (not scaled).
  // a (sats/token) = gradThreshold * b / (PRICE_MULTIPLIER - 1)
  // aScaled = a * SCALE = gradThreshold * bScaled / 99
  const aScaled = (graduationThresholdSats * bScaled) / 99n;

  return { aScaled, bScaled };
}

// ─── Simulator class ──────────────────────────────────

export class BondingCurveSimulator {
  simulateBuy(
    reserves: Reserves,
    btcAmountSats: bigint,
    buyTaxBps: bigint = 0n,
  ): BuySimulation {
    if (btcAmountSats < MIN_TRADE_SATS) {
      throw new Error("Below minimum trade amount");
    }

    const priceBefore = calculatePrice(reserves.aScaled, reserves.bScaled, reserves.currentSupplyOnCurve);
    const fees = this.calculateFees(btcAmountSats, buyTaxBps);
    const netBtc = btcAmountSats - fees.total;

    // Prevent buying beyond graduation threshold
    const graduationThreshold = reserves.graduationThreshold ?? GRADUATION_THRESHOLD_SATS;
    if (reserves.realBtcReserve + netBtc > graduationThreshold) {
      throw new Error("Exceeds graduation threshold");
    }

    // Max tokens that can still be bought on the curve
    const totalCurve = reserves.curveSupply ?? (reserves.currentSupplyOnCurve + 100_000_000_000_000_000n);
    const maxDelta = totalCurve - reserves.currentSupplyOnCurve;
    const tokensOut = maxTokensForBudget(
      reserves.aScaled, reserves.bScaled,
      reserves.currentSupplyOnCurve, netBtc, maxDelta,
    );

    const actualCost = calculateBuyCost(
      reserves.aScaled, reserves.bScaled,
      reserves.currentSupplyOnCurve, tokensOut,
    );

    const newSupply = reserves.currentSupplyOnCurve + tokensOut;
    const newReserves: Reserves = {
      currentSupplyOnCurve: newSupply,
      realBtcReserve: reserves.realBtcReserve + actualCost,
      aScaled: reserves.aScaled,
      bScaled: reserves.bScaled,
    };

    const priceAfter = calculatePrice(reserves.aScaled, reserves.bScaled, newSupply);
    const priceImpactBps = priceBefore > 0n
      ? Number(((priceAfter - priceBefore) * 10000n) / priceBefore)
      : 0;

    const effectivePriceSats = tokensOut > 0n ? (btcAmountSats * PRICE_PRECISION) / tokensOut : 0n;

    return {
      tokensOut,
      fees,
      newReserves,
      priceImpactBps,
      newPriceSats: priceAfter,
      effectivePriceSats,
    };
  }

  simulateSell(
    reserves: Reserves,
    tokenAmount: bigint,
    sellTaxBps: bigint = 0n,
  ): SellSimulation {
    const priceBefore = calculatePrice(reserves.aScaled, reserves.bScaled, reserves.currentSupplyOnCurve);

    const grossBtcOut = calculateSellPayout(
      reserves.aScaled, reserves.bScaled,
      reserves.currentSupplyOnCurve, tokenAmount,
    );

    if (grossBtcOut > reserves.realBtcReserve) {
      throw new Error("Insufficient real BTC reserve");
    }

    if (grossBtcOut < MIN_TRADE_SATS) {
      throw new Error("Below minimum trade amount");
    }

    const fees = this.calculateFees(grossBtcOut, sellTaxBps);
    const btcOut = grossBtcOut - fees.total;

    const newSupply = reserves.currentSupplyOnCurve - tokenAmount;
    const newReserves: Reserves = {
      currentSupplyOnCurve: newSupply,
      realBtcReserve: reserves.realBtcReserve - grossBtcOut,
      aScaled: reserves.aScaled,
      bScaled: reserves.bScaled,
    };

    const priceAfter = calculatePrice(reserves.aScaled, reserves.bScaled, newSupply);
    const priceImpactBps = priceBefore > 0n
      ? Number(((priceBefore - priceAfter) * 10000n) / priceBefore)
      : 0;

    const effectivePriceSats = tokenAmount > 0n ? (grossBtcOut * PRICE_PRECISION) / tokenAmount : 0n;

    return {
      btcOut,
      fees,
      newReserves,
      priceImpactBps,
      newPriceSats: priceAfter,
      effectivePriceSats,
    };
  }

  private calculateFees(amount: bigint, flywheelBps: bigint): FeeBreakdown {
    const platform = (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
    const baseFee = (amount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
    const creator = baseFee - platform;
    const flywheel = (amount * flywheelBps) / FEE_DENOMINATOR;
    const total = baseFee + flywheel;
    return { platform, creator, flywheel, total };
  }

  calculatePrice(
    aScaled: bigint,
    bScaled: bigint,
    supplyUnits: bigint,
  ): bigint {
    return calculatePrice(aScaled, bScaled, supplyUnits);
  }

  static getInitialReserves(
    curveSupplyUnits: bigint = 100_000_000_000_000_000n,
    graduationThresholdSats: bigint = GRADUATION_THRESHOLD_SATS,
  ): Reserves {
    const { aScaled, bScaled } = deriveParams(curveSupplyUnits, graduationThresholdSats);
    return {
      currentSupplyOnCurve: 0n,
      realBtcReserve: 0n,
      aScaled,
      bScaled,
    };
  }
}

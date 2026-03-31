import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';
import { Revert } from '@btc-vision/btc-runtime/runtime';
import { ExpMath } from './ExpMath';
import {
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  PLATFORM_FEE_BPS,
  PRICE_PRECISION,
  TOKEN_UNITS_PER_TOKEN,
  GRAD_SUPPLY_FRACTION_BPS,
  LN_100_SCALED,
  PRICE_MULTIPLIER_MINUS_1,
} from './Constants';

/**
 * Exponential bonding curve math library.
 *
 * Formula: Price(x) = a * e^(b*x)
 * Buy cost:   (a/b) * [e^(b*(x+dt)) - e^(b*x)]
 * Sell payout: (a/b) * [e^(b*x) - e^(b*(x-dt))]
 *
 * All operations use SafeMath — no raw arithmetic.
 */
export class BondingCurve {
  /**
   * Compute b*x in scaled form for expScaled().
   * b is per whole token, x is in token units.
   * bx_scaled = bScaled * supplyUnits / TOKEN_UNITS_PER_TOKEN
   */
  @inline
  private static bxScaled(bScaled: u256, supplyUnits: u256): u256 {
    return SafeMath.div(SafeMath.mul(bScaled, supplyUnits), TOKEN_UNITS_PER_TOKEN);
  }

  /**
   * Buy cost in sats (ceil of integral).
   * Cost = (a/b) * [e^(b*(x+dt)) - e^(b*x)]
   */
  static calculateBuyCost(
    aScaled: u256,
    bScaled: u256,
    supplyUnits: u256,
    deltaUnits: u256,
  ): u256 {
    if (deltaUnits.isZero()) return u256.Zero;

    const bxAfter = BondingCurve.bxScaled(bScaled, SafeMath.add(supplyUnits, deltaUnits));
    const bxBefore = BondingCurve.bxScaled(bScaled, supplyUnits);

    const expAfter = ExpMath.expScaled(bxAfter);
    const expBefore = ExpMath.expScaled(bxBefore);
    const diff = SafeMath.sub(expAfter, expBefore);

    // cost = ceil((aScaled * diff) / (bScaled * SCALE))
    const numerator = SafeMath.mul(aScaled, diff);
    const denominator = SafeMath.mul(bScaled, ExpMath.SCALE);

    // Ceil division: (num + denom - 1) / denom
    return SafeMath.div(
      SafeMath.add(numerator, SafeMath.sub(denominator, SafeMath.ONE)),
      denominator,
    );
  }

  /**
   * Sell payout in sats (floor of integral — protocol-favoring).
   * Payout = (a/b) * [e^(b*x) - e^(b*(x-dt))]
   */
  static calculateSellPayout(
    aScaled: u256,
    bScaled: u256,
    supplyUnits: u256,
    deltaUnits: u256,
  ): u256 {
    if (deltaUnits.isZero()) return u256.Zero;
    if (u256.gt(deltaUnits, supplyUnits)) {
      throw new Revert('Sell exceeds supply on curve');
    }

    const bxBefore = BondingCurve.bxScaled(bScaled, supplyUnits);
    const bxAfter = BondingCurve.bxScaled(bScaled, SafeMath.sub(supplyUnits, deltaUnits));

    const expBefore = ExpMath.expScaled(bxBefore);
    const expAfter = ExpMath.expScaled(bxAfter);
    const diff = SafeMath.sub(expBefore, expAfter);

    // payout = floor((aScaled * diff) / (bScaled * SCALE))
    return SafeMath.div(
      SafeMath.mul(aScaled, diff),
      SafeMath.mul(bScaled, ExpMath.SCALE),
    );
  }

  /**
   * Spot price at current supply: a * e^(b*x).
   * Returns price * PRICE_PRECISION (10^18).
   */
  static calculatePrice(aScaled: u256, bScaled: u256, supplyUnits: u256): u256 {
    const bx = BondingCurve.bxScaled(bScaled, supplyUnits);
    const expVal = ExpMath.expScaled(bx);
    // price_scaled = aScaled * expVal / SCALE = a * exp(bx) * SCALE
    return SafeMath.div(SafeMath.mul(aScaled, expVal), ExpMath.SCALE);
  }

  /**
   * Max tokens that can be bought with `budgetSats`.
   * Binary search on [0, maxDelta].
   */
  static maxTokensForBudget(
    aScaled: u256,
    bScaled: u256,
    supplyUnits: u256,
    budgetSats: u256,
    maxDelta: u256,
  ): u256 {
    if (budgetSats.isZero() || maxDelta.isZero()) return u256.Zero;

    let hi = maxDelta;

    // Quick check: can we buy everything?
    let hiCost = BondingCurve.calculateBuyCost(aScaled, bScaled, supplyUnits, hi);
    if (u256.le(hiCost, budgetSats)) return hi;

    // Narrow bracket: halve hi while cost(hi) > budget (saves ~10-20 exp evaluations)
    while (u256.gt(hiCost, budgetSats)) {
      const half = SafeMath.div(hi, u256.fromU32(2));
      if (half.isZero()) break;
      hi = half;
      hiCost = BondingCurve.calculateBuyCost(aScaled, bScaled, supplyUnits, hi);
    }
    // hi is now <= answer. Expand back one step for the upper bound.
    const expandedHi = SafeMath.mul(hi, u256.fromU32(2));
    hi = u256.gt(expandedHi, maxDelta) ? maxDelta : expandedHi;

    let lo: u256 = u256.Zero;
    let ans: u256 = u256.Zero;

    // Binary search: find max delta where cost <= budget
    for (let i: u32 = 0; i < 60; i++) {
      if (u256.gt(lo, hi)) break;

      const mid = SafeMath.add(lo, SafeMath.div(SafeMath.sub(hi, lo), u256.fromU32(2)));

      if (mid.isZero()) {
        // Check if at least 1 unit is affordable
        const c = BondingCurve.calculateBuyCost(aScaled, bScaled, supplyUnits, SafeMath.ONE);
        if (u256.le(c, budgetSats)) {
          ans = SafeMath.ONE;
          lo = u256.fromU32(2);
        } else {
          break;
        }
        continue;
      }

      const cost = BondingCurve.calculateBuyCost(aScaled, bScaled, supplyUnits, mid);
      if (u256.le(cost, budgetSats)) {
        ans = mid;
        lo = SafeMath.add(mid, SafeMath.ONE);
      } else {
        hi = SafeMath.sub(mid, SafeMath.ONE);
      }
    }

    return ans;
  }

  /**
   * Derive curve parameters from curve supply and graduation threshold.
   * b = ln(100) / x_grad   (per whole token)
   * a = gradThreshold * b / 99
   *
   * Returns [aScaled, bScaled] as a StaticArray.
   */
  static deriveParams(curveSupplyUnits: u256, graduationThreshold: u256): StaticArray<u256> {
    // bScaled = LN_100_SCALED * FEE_DENOMINATOR * TOKEN_UNITS / (curveSupply * GRAD_FRACTION_BPS)
    const bNumerator = SafeMath.mul(
      SafeMath.mul(LN_100_SCALED, FEE_DENOMINATOR),
      TOKEN_UNITS_PER_TOKEN,
    );
    const bDenominator = SafeMath.mul(curveSupplyUnits, GRAD_SUPPLY_FRACTION_BPS);
    const bScaled = SafeMath.div(bNumerator, bDenominator);

    // aScaled = graduationThreshold * bScaled / 99
    const aScaled = SafeMath.div(
      SafeMath.mul(graduationThreshold, bScaled),
      PRICE_MULTIPLIER_MINUS_1,
    );

    const result = new StaticArray<u256>(2);
    result[0] = aScaled;
    result[1] = bScaled;
    return result;
  }

  // ─── Fee functions (curve-agnostic) ─────────────────

  /**
   * Calculate total fee amount: amount * TOTAL_FEE_BPS / FEE_DENOMINATOR
   */
  static calculateTotalFee(amount: u256): u256 {
    return SafeMath.div(SafeMath.mul(amount, TOTAL_FEE_BPS), FEE_DENOMINATOR);
  }

  /**
   * Calculate individual fee from amount using given bps.
   */
  static calculateFee(amount: u256, feeBps: u256): u256 {
    return SafeMath.div(SafeMath.mul(amount, feeBps), FEE_DENOMINATOR);
  }

  /**
   * Split the total fee into platform and creator portions.
   * Returns [platformFee, creatorFee]
   */
  static splitFees(amount: u256): StaticArray<u256> {
    const total = BondingCurve.calculateTotalFee(amount);
    const platformFee = SafeMath.div(SafeMath.mul(amount, PLATFORM_FEE_BPS), FEE_DENOMINATOR);
    const creatorFee = SafeMath.sub(total, platformFee);
    const result = new StaticArray<u256>(2);
    result[0] = platformFee;
    result[1] = creatorFee;
    return result;
  }
}

import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';
import { Revert } from '@btc-vision/btc-runtime/runtime';

/**
 * Fixed-point exponential math using u256 and SafeMath.
 *
 * All values are scaled by SCALE = 10^18.
 * expScaled(x) takes x * SCALE and returns e^x * SCALE.
 *
 * Algorithm: decompose into 2^k * exp(r) where r ∈ [0, ln2).
 * Taylor series (20 terms) for exp(r) gives precision better than 1e-15.
 */
export class ExpMath {
  // 10^18
  static readonly SCALE: u256 = u256.fromString('1000000000000000000');

  // ln(2) * 10^18 = 693147180559945309
  static readonly LN2_SCALED: u256 = u256.fromString('693147180559945309');

  // Maximum safe argument: 100 * SCALE (exp(100) ≈ 2.69e43, fits in u256)
  static readonly MAX_ARG: u256 = u256.fromString('100000000000000000000');

  /**
   * Compute e^x in fixed-point u256 arithmetic.
   * @param xScaled  x * 10^18  (must be >= 0, <= MAX_ARG)
   * @returns e^x * 10^18
   */
  static expScaled(xScaled: u256): u256 {
    if (xScaled.isZero()) return ExpMath.SCALE;
    if (u256.gt(xScaled, ExpMath.MAX_ARG)) {
      throw new Revert('ExpMath: argument too large');
    }

    // Decompose: e^x = 2^k * e^r  where r = x - k*ln(2)
    const k = SafeMath.div(xScaled, ExpMath.LN2_SCALED);
    const r = SafeMath.sub(xScaled, SafeMath.mul(k, ExpMath.LN2_SCALED));

    // Taylor series for e^(r/SCALE) * SCALE
    let sum: u256 = ExpMath.SCALE;
    let term: u256 = ExpMath.SCALE;

    for (let i: u32 = 1; i <= 20; i++) {
      const iU256 = u256.fromU32(i);
      // term = term * r / (i * SCALE)
      const divisor = SafeMath.mul(iU256, ExpMath.SCALE);
      term = SafeMath.div(SafeMath.mul(term, r), divisor);
      sum = SafeMath.add(sum, term);
      if (term.isZero()) break;
    }

    // Multiply by 2^k via left-shift
    if (!k.isZero()) {
      // k fits in i32 since max xScaled / LN2_SCALED ≈ 144
      const kI32: i32 = <i32>k.lo1;
      sum = SafeMath.shl(sum, kI32);
    }

    return sum;
  }
}

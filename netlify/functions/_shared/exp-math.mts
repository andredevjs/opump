/**
 * Fixed-point exponential math using bigint.
 *
 * All values are scaled by SCALE = 10^18.
 * expScaled(x) takes x * SCALE and returns e^x * SCALE.
 *
 * Algorithm: decompose into 2^k * exp(r) where r ∈ [0, ln2).
 * Taylor series (20 terms) for exp(r) with r < ln(2) ≈ 0.693
 * gives precision better than 1e-15.
 */

export const EXP_SCALE = 10n ** 18n;

// ln(2) * 10^18
const LN2_SCALED = 693_147_180_559_945_309n;

// Maximum safe argument: exp(100) ≈ 2.69e43, well within u256
const MAX_ARG_SCALED = 100n * EXP_SCALE;

/**
 * Compute e^x in fixed-point.
 * @param xScaled  x * 10^18  (must be >= 0)
 * @returns e^x * 10^18
 */
export function expScaled(xScaled: bigint): bigint {
  if (xScaled === 0n) return EXP_SCALE;
  if (xScaled < 0n) throw new Error("expScaled: negative argument");
  if (xScaled > MAX_ARG_SCALED) throw new Error("expScaled: argument too large");

  // Decompose: e^x = 2^k * e^r  where r = x - k*ln(2), 0 <= r < ln(2)
  const k = xScaled / LN2_SCALED;
  const r = xScaled - k * LN2_SCALED;

  // Taylor series for e^(r/SCALE) * SCALE
  // term_i = r^i / (i! * SCALE^(i-1))
  let sum = EXP_SCALE;
  let term = EXP_SCALE;

  for (let i = 1n; i <= 20n; i++) {
    term = (term * r) / (i * EXP_SCALE);
    sum += term;
    if (term === 0n) break;
  }

  // Multiply by 2^k
  if (k > 0n) {
    sum = sum << k;
  }

  return sum;
}

// ln(100) * 10^18  — hardcoded for precision
export const LN_100_SCALED = 4_605_170_185_988_091_368n;

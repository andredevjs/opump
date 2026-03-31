/**
 * Exponential math helpers for the frontend bonding curve calculator.
 *
 * Uses native Math.exp() / Math.log() since frontend calculations are
 * display-only (not authoritative). The contract and backend use
 * fixed-point bigint arithmetic for precision.
 */

/**
 * Compute e^x using native float.
 * @param x  The exponent (unscaled float)
 * @returns e^x
 */
export function safeExp(x: number): number {
  if (x > 709) throw new Error('safeExp: overflow');
  if (x < -745) throw new Error('safeExp: underflow');
  const result = Math.exp(x);
  if (!Number.isFinite(result)) throw new Error('safeExp: non-finite result');
  return result;
}

/**
 * Compute ln(x) using native float.
 * @param x  Must be > 0
 * @returns ln(x)
 */
export function safeLn(x: number): number {
  if (x <= 0) throw new Error('safeLn: non-positive argument');
  const result = Math.log(x);
  if (!Number.isFinite(result)) throw new Error('safeLn: non-finite result');
  return result;
}

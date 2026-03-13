import {
  PRICE_PRECISION,
} from '../../../shared/constants/bonding-curve.js';

/**
 * Divisor for converting PRICE_PRECISION-scaled bigint to sats per whole token.
 * = PRICE_PRECISION / 10^TOKEN_DECIMALS = 10^10
 * Kept as bigint to avoid Number() on large values.
 */
const PRICE_DISPLAY_DIVISOR_BIG = 10n ** 10n;

/**
 * Number of decimal digits in the fractional part (log10 of PRICE_DISPLAY_DIVISOR_BIG).
 */
const FRAC_DIGITS = 10;

/**
 * Convert a PRICE_PRECISION-scaled bigint to a display price string
 * representing sats per whole token.
 *
 * All arithmetic stays in bigint space to avoid Number() precision loss
 * on values that can exceed Number.MAX_SAFE_INTEGER.
 */
export function toDisplayPrice(virtualBtc: bigint, virtualToken: bigint): string {
  if (virtualToken === 0n) return '0';

  const scaled = (virtualBtc * PRICE_PRECISION) / virtualToken;
  const intPart = scaled / PRICE_DISPLAY_DIVISOR_BIG;
  const fracPart = scaled % PRICE_DISPLAY_DIVISOR_BIG;

  // Pad fractional part and trim trailing zeros
  const fracStr = fracPart.toString().padStart(FRAC_DIGITS, '0').replace(/0+$/, '');
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

/**
 * Convert a pre-computed PRICE_PRECISION-scaled bigint to a display price string.
 * Use this overload when the caller has already computed (vBtc * PRICE_PRECISION / vToken).
 */
export function scaledToDisplayPrice(scaled: bigint): string {
  const intPart = scaled / PRICE_DISPLAY_DIVISOR_BIG;
  const fracPart = scaled % PRICE_DISPLAY_DIVISOR_BIG;

  const fracStr = fracPart.toString().padStart(FRAC_DIGITS, '0').replace(/0+$/, '');
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

/**
 * Frontend bonding curve wrappers.
 *
 * Delegates to the canonical shared BigInt implementation for all math.
 * Preserves the existing TradeSimulation API shape so callers don't change.
 */
import BigNumber from 'bignumber.js';
import {
  BondingCurveSimulator,
  calculatePrice as sharedCalculatePrice,
} from '@shared/lib/bonding-curve';
import {
  GRADUATION_THRESHOLD_SATS as GRADUATION_THRESHOLD_SATS_BI,
  TOKEN_UNITS_PER_TOKEN as TOKEN_UNITS_BI,
} from '@shared/constants/bonding-curve';
import { GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import type { TradeSimulation } from '@/types/trade';

const simulator = new BondingCurveSimulator();

/**
 * Convert PRICE_PRECISION-scaled bigint price to sats per whole token (number).
 * calculatePrice() returns spotPrice * 10^18; dividing by 10^18 gives sats/wholeToken.
 */
function scaledToSatsPerWholeToken(priceScaled: bigint): number {
  return Number(priceScaled) / 1e18;
}

function toReserves(
  currentSupplyOnCurve: BigNumber,
  aScaled: BigNumber,
  bScaled: BigNumber,
  realBtcReserve?: BigNumber,
) {
  return {
    currentSupplyOnCurve: BigInt(currentSupplyOnCurve.toFixed(0)),
    realBtcReserve: realBtcReserve ? BigInt(realBtcReserve.toFixed(0)) : 0n,
    aScaled: BigInt(aScaled.toFixed(0)),
    bScaled: BigInt(bScaled.toFixed(0)),
    graduationThreshold: GRADUATION_THRESHOLD_SATS_BI,
  };
}

export function calculateBuy(
  currentSupplyOnCurve: BigNumber,
  aScaled: BigNumber,
  bScaled: BigNumber,
  btcInputSats: string,
  realBtcReserve?: BigNumber,
): TradeSimulation | null {
  try {
    const input = BigInt(btcInputSats);
    if (input <= 0n) return null;

    const reserves = toReserves(currentSupplyOnCurve, aScaled, bScaled, realBtcReserve);
    const result = simulator.simulateBuy(reserves, input);

    // Effective price: net BTC per whole token (use Number to avoid integer truncation)
    const netBtc = input - result.fees.total;
    const pricePerToken = result.tokensOut > 0n
      ? Number(netBtc) * Number(TOKEN_UNITS_BI) / Number(result.tokensOut)
      : 0;

    return {
      type: 'buy',
      inputAmount: input.toString(),
      outputAmount: result.tokensOut.toString(),
      pricePerToken,
      priceImpactPercent: result.priceImpactBps / 100,
      fee: Number(result.fees.total),
      newPriceSats: scaledToSatsPerWholeToken(result.newPriceSats),
      newSupplyOnCurve: result.newReserves.currentSupplyOnCurve.toString(),
    };
  } catch {
    return null;
  }
}

export function calculateSell(
  currentSupplyOnCurve: BigNumber,
  aScaled: BigNumber,
  bScaled: BigNumber,
  tokenInputUnits: string,
): TradeSimulation | null {
  try {
    const input = BigInt(tokenInputUnits);
    if (input <= 0n) return null;

    const reserves = toReserves(currentSupplyOnCurve, aScaled, bScaled);
    // For sell, realBtcReserve must be at least the payout. The simulator checks this.
    // Set to graduation threshold since frontend doesn't always have exact realBtc.
    reserves.realBtcReserve = GRADUATION_THRESHOLD_SATS_BI;

    const result = simulator.simulateSell(reserves, input);

    // Effective price: net BTC out per whole token (use Number to avoid truncation)
    const pricePerToken = input > 0n
      ? Number(result.btcOut) * Number(TOKEN_UNITS_BI) / Number(input)
      : 0;

    return {
      type: 'sell',
      inputAmount: input.toString(),
      outputAmount: result.btcOut.toString(),
      pricePerToken,
      priceImpactPercent: -(result.priceImpactBps / 100),
      fee: Number(result.fees.total),
      newPriceSats: scaledToSatsPerWholeToken(result.newPriceSats),
      newSupplyOnCurve: result.newReserves.currentSupplyOnCurve.toString(),
    };
  } catch {
    return null;
  }
}

/**
 * Current spot price: a * e^(b*x).
 * Returns price in sats per whole token.
 */
export function getCurrentPrice(
  currentSupplyOnCurve: BigNumber,
  aScaled: BigNumber,
  bScaled: BigNumber,
): number {
  const priceScaled = sharedCalculatePrice(
    BigInt(aScaled.toFixed(0)),
    BigInt(bScaled.toFixed(0)),
    BigInt(currentSupplyOnCurve.toFixed(0)),
  );
  return scaledToSatsPerWholeToken(priceScaled);
}

export function getGraduationProgress(
  realBtcReserveSats: number,
  threshold: number = GRADUATION_THRESHOLD_SATS,
): number {
  if (threshold <= 0) return 0;
  return Math.min(100, (realBtcReserveSats / threshold) * 100);
}

export function getMarketCap(priceSats: number, totalSupplyUnits: string): string {
  return new BigNumber(totalSupplyUnits).times(priceSats).toFixed(0);
}

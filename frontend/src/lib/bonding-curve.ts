import BigNumber from 'bignumber.js';
import { TOTAL_FEE_PERCENT, GRADUATION_THRESHOLD_SATS, TOKEN_UNITS_PER_TOKEN } from '@/config/constants';
import { safeExp, safeLn } from '@/lib/exp-math';
import type { TradeSimulation } from '@/types/trade';

/**
 * Exponential bonding curve: Price(x) = a * e^(b*x)
 * Buy cost:   (a/b) * [e^(b*(x+dt)) - e^(b*x)]
 * Sell payout: (a/b) * [e^(b*x) - e^(b*(x-dt))]
 *
 * Frontend uses native Math.exp()/Math.log() for display-only calculations.
 * The contract and backend use fixed-point bigint for authoritative values.
 */

/** Convert token units (bigint-string) to whole tokens (float). */
function unitsToWhole(units: BigNumber): number {
  return units.div(TOKEN_UNITS_PER_TOKEN).toNumber();
}

export function calculateBuy(
  currentSupplyOnCurve: BigNumber,
  aScaled: BigNumber,
  bScaled: BigNumber,
  btcInputSats: string,
  realBtcReserve?: BigNumber,
): TradeSimulation | null {
  const input = new BigNumber(btcInputSats);
  if (input.isNaN() || !input.isFinite() || input.isLessThanOrEqualTo(0)) return null;

  // Fee rounds UP (protocol's favor)
  const fee = input.times(TOTAL_FEE_PERCENT).div(100).integerValue(BigNumber.ROUND_CEIL);
  const netBtc = input.minus(fee);

  // Prevent buying beyond graduation threshold
  if (realBtcReserve) {
    const newRealBtc = realBtcReserve.plus(netBtc);
    if (newRealBtc.isGreaterThan(GRADUATION_THRESHOLD_SATS)) return null;
  }

  // Convert params to floats for native Math
  const a = aScaled.div(1e18).toNumber();
  const b = bScaled.div(1e18).toNumber();
  const x = unitsToWhole(currentSupplyOnCurve);
  const budget = netBtc.toNumber();

  if (a <= 0 || b <= 0) return null;

  // Inverse formula: dt = (1/b) * ln(b*budget/a + e^(bx)) - x
  const ebx = safeExp(b * x);
  const inner = (b / a) * budget + ebx;
  if (inner <= 0) return null;
  const dtWhole = (1 / b) * safeLn(inner) - x;
  if (dtWhole <= 0) return null;

  const tokensOutUnits = new BigNumber(Math.floor(dtWhole * TOKEN_UNITS_PER_TOKEN)).integerValue();

  const dtW = tokensOutUnits.div(TOKEN_UNITS_PER_TOKEN).toNumber();

  const spotPriceBefore = a * ebx;
  const spotPriceAfter = a * safeExp(b * (x + dtW));
  const priceImpact = spotPriceBefore > 0
    ? ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100
    : 0;

  const pricePerToken = tokensOutUnits.isGreaterThan(0)
    ? netBtc.times(TOKEN_UNITS_PER_TOKEN).div(tokensOutUnits).toNumber()
    : 0;

  return {
    type: 'buy',
    inputAmount: input.toFixed(0),
    outputAmount: tokensOutUnits.toFixed(0),
    pricePerToken,
    priceImpactPercent: priceImpact,
    fee: fee.toNumber(),
    newPriceSats: spotPriceAfter,
    newSupplyOnCurve: currentSupplyOnCurve.plus(tokensOutUnits).toFixed(0),
  };
}

export function calculateSell(
  currentSupplyOnCurve: BigNumber,
  aScaled: BigNumber,
  bScaled: BigNumber,
  tokenInputUnits: string,
): TradeSimulation | null {
  const input = new BigNumber(tokenInputUnits);
  if (input.isNaN() || !input.isFinite() || input.isLessThanOrEqualTo(0)) return null;
  if (input.isGreaterThan(currentSupplyOnCurve)) return null;

  const a = aScaled.div(1e18).toNumber();
  const b = bScaled.div(1e18).toNumber();
  const x = unitsToWhole(currentSupplyOnCurve);
  const dtW = input.div(TOKEN_UNITS_PER_TOKEN).toNumber();

  if (a <= 0 || b <= 0) return null;
  if (dtW > x) return null;

  const btcOutBeforeFee = (a / b) * (safeExp(b * x) - safeExp(b * (x - dtW)));

  // Fee rounds UP (protocol's favor)
  const btcOutBN = new BigNumber(Math.floor(btcOutBeforeFee));
  const fee = btcOutBN.times(TOTAL_FEE_PERCENT).div(100).integerValue(BigNumber.ROUND_CEIL);
  const btcOut = btcOutBN.minus(fee);

  const pricePerToken = input.isGreaterThan(0)
    ? btcOut.times(TOKEN_UNITS_PER_TOKEN).div(input).toNumber()
    : 0;

  const spotPriceBefore = a * safeExp(b * x);
  const spotPriceAfter = a * safeExp(b * (x - dtW));
  const priceImpact = spotPriceBefore > 0
    ? ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100
    : 0;

  return {
    type: 'sell',
    inputAmount: input.toFixed(0),
    outputAmount: BigNumber.max(0, btcOut).toFixed(0),
    pricePerToken,
    priceImpactPercent: priceImpact,
    fee: fee.toNumber(),
    newPriceSats: spotPriceAfter,
    newSupplyOnCurve: currentSupplyOnCurve.minus(input).toFixed(0),
  };
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
  const a = aScaled.div(1e18).toNumber();
  const b = bScaled.div(1e18).toNumber();
  const x = unitsToWhole(currentSupplyOnCurve);
  return a * safeExp(b * x);
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


import BigNumber from 'bignumber.js';
import { K, TOTAL_FEE_PERCENT, GRADUATION_THRESHOLD_SATS, TOKEN_UNITS_PER_TOKEN } from '@/config/constants';
import type { TradeSimulation } from '@/types/trade';

/**
 * Constant-product AMM: k = virtualBtcReserve * virtualTokenSupply
 * Buy:  tokensOut = virtualTokenSupply - (k / (virtualBtcReserve + btcAfterFee))
 * Sell: btcOut    = virtualBtcReserve  - (k / (virtualTokenSupply + tokensIn)) - fee
 *
 * Prices use 10^18 precision to handle sub-sat values at the start of the curve.
 */

export function calculateBuy(
  virtualBtcReserve: BigNumber,
  virtualTokenSupply: BigNumber,
  btcInputSats: string,
  realBtcReserve?: BigNumber,
): TradeSimulation | null {
  const input = new BigNumber(btcInputSats);
  if (input.isNaN() || !input.isFinite() || input.isLessThanOrEqualTo(0)) return null;

  // Fee rounds UP (protocol's favor)
  const fee = input.times(TOTAL_FEE_PERCENT).div(100).integerValue(BigNumber.ROUND_CEIL);
  const btcAfterFee = input.minus(fee);

  // Prevent buying beyond graduation threshold
  if (realBtcReserve) {
    const newRealBtc = realBtcReserve.plus(btcAfterFee);
    if (newRealBtc.isGreaterThan(GRADUATION_THRESHOLD_SATS)) return null;
  }

  const newVirtualBtc = virtualBtcReserve.plus(btcAfterFee);
  if (newVirtualBtc.isLessThanOrEqualTo(0)) return null;

  const newVirtualToken = K.div(newVirtualBtc).integerValue();
  const tokensOut = virtualTokenSupply.minus(newVirtualToken);

  // Effective price per token with 10^18 precision
  const pricePerToken = tokensOut.isGreaterThan(0)
    ? btcAfterFee.times(TOKEN_UNITS_PER_TOKEN).div(tokensOut).toNumber()
    : 0;

  const spotPriceBefore = virtualBtcReserve.times(TOKEN_UNITS_PER_TOKEN).div(virtualTokenSupply).toNumber();
  const spotPriceAfter = newVirtualBtc.times(TOKEN_UNITS_PER_TOKEN).div(newVirtualToken).toNumber();
  const priceImpact = spotPriceBefore > 0
    ? ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100
    : 0;

  return {
    type: 'buy',
    inputAmount: input.toFixed(0),
    outputAmount: tokensOut.toFixed(0),
    pricePerToken,
    priceImpactPercent: priceImpact,
    fee: fee.toNumber(),
    newPriceSats: spotPriceAfter,
    newVirtualBtc: newVirtualBtc.toFixed(0),
    newVirtualToken: newVirtualToken.toFixed(0),
  };
}

export function calculateSell(
  virtualBtcReserve: BigNumber,
  virtualTokenSupply: BigNumber,
  tokenInputUnits: string,
): TradeSimulation | null {
  const input = new BigNumber(tokenInputUnits);
  if (input.isNaN() || !input.isFinite() || input.isLessThanOrEqualTo(0)) return null;

  const newVirtualToken = virtualTokenSupply.plus(input);
  if (newVirtualToken.isLessThanOrEqualTo(0)) return null;

  const newVirtualBtc = K.div(newVirtualToken).integerValue();
  const btcOutBeforeFee = virtualBtcReserve.minus(newVirtualBtc);

  // Fee rounds UP (protocol's favor)
  const fee = btcOutBeforeFee.times(TOTAL_FEE_PERCENT).div(100).integerValue(BigNumber.ROUND_CEIL);
  const btcOut = btcOutBeforeFee.minus(fee);

  const pricePerToken = input.isGreaterThan(0)
    ? btcOut.times(TOKEN_UNITS_PER_TOKEN).div(input).toNumber()
    : 0;

  const spotPriceBefore = virtualBtcReserve.times(TOKEN_UNITS_PER_TOKEN).div(virtualTokenSupply).toNumber();
  const spotPriceAfter = newVirtualBtc.times(TOKEN_UNITS_PER_TOKEN).div(newVirtualToken).toNumber();
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
    newVirtualBtc: newVirtualBtc.toFixed(0),
    newVirtualToken: newVirtualToken.toFixed(0),
  };
}

/**
 * Calculate current price with 10^18 precision.
 * Consumers divide by 10^18 to get sats per whole token.
 */
export function getCurrentPrice(virtualBtcReserve: BigNumber, virtualTokenSupply: BigNumber): number {
  if (virtualTokenSupply.isZero()) return 0;
  return virtualBtcReserve.times(TOKEN_UNITS_PER_TOKEN).div(virtualTokenSupply).toNumber();
}

// S28: Accept threshold as a parameter with default
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

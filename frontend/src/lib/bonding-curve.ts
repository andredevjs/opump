import BigNumber from 'bignumber.js';
import { K, TOTAL_FEE_PERCENT, GRADUATION_THRESHOLD_SATS, TOKEN_UNITS_PER_TOKEN } from '@/config/constants';
import type { TradeSimulation } from '@/types/trade';

/**
 * Constant-product AMM: k = virtualBtcReserve * virtualTokenSupply
 * Buy:  tokensOut = virtualTokenSupply - (k / (virtualBtcReserve + btcAfterFee))
 * Sell: btcOut    = virtualBtcReserve  - (k / (virtualTokenSupply + tokensIn)) - fee
 */

export function calculateBuy(
  virtualBtcReserve: BigNumber,
  virtualTokenSupply: BigNumber,
  btcInputSats: string,
): TradeSimulation | null {
  const input = new BigNumber(btcInputSats);
  if (input.isNaN() || !input.isFinite() || input.isLessThanOrEqualTo(0)) return null;

  // Fee rounds UP (protocol's favor)
  const fee = input.times(TOTAL_FEE_PERCENT).div(100).integerValue(BigNumber.ROUND_CEIL);
  const btcAfterFee = input.minus(fee);

  const newVirtualBtc = virtualBtcReserve.plus(btcAfterFee);
  if (newVirtualBtc.isLessThanOrEqualTo(0)) return null;

  const newVirtualToken = K.div(newVirtualBtc).integerValue();
  const tokensOut = virtualTokenSupply.minus(newVirtualToken);

  // Price per whole token (sats per token, not per smallest unit)
  const pricePerToken = tokensOut.isGreaterThan(0)
    ? btcAfterFee.times(TOKEN_UNITS_PER_TOKEN).div(tokensOut).toNumber()
    : 0;

  // Spot price safe for toNumber(): reserves ~3e9 * 1e8 / ~1e17 yields small values
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
 * Calculate current price in sats per whole token.
 */
export function getCurrentPrice(virtualBtcReserve: BigNumber, virtualTokenSupply: BigNumber): number {
  if (virtualTokenSupply.isZero()) return 0;
  return virtualBtcReserve.times(TOKEN_UNITS_PER_TOKEN).div(virtualTokenSupply).toNumber();
}

export function getGraduationProgress(realBtcReserveSats: number): number {
  return Math.min(100, (realBtcReserveSats / GRADUATION_THRESHOLD_SATS) * 100);
}

export function getMarketCap(priceSats: number, totalSupplyUnits: string): string {
  return new BigNumber(totalSupplyUnits).times(priceSats).toFixed(0);
}

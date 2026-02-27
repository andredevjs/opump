import BigNumber from 'bignumber.js';
import { K, TOTAL_FEE_PERCENT, GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import type { TradeSimulation } from '@/types/trade';

/**
 * Constant-product AMM: k = virtualBtcReserve * virtualTokenSupply
 * Buy:  tokensOut = virtualTokenSupply - (k / (virtualBtcReserve + btcAfterFee))
 * Sell: btcOut    = virtualBtcReserve  - (k / (virtualTokenSupply + tokensIn)) - fee
 */

export function calculateBuy(
  virtualBtcReserve: BigNumber,
  virtualTokenSupply: BigNumber,
  btcInputSats: number,
): TradeSimulation {
  const input = new BigNumber(btcInputSats);
  const fee = input.times(TOTAL_FEE_PERCENT).div(100).integerValue();
  const btcAfterFee = input.minus(fee);

  const newVirtualBtc = virtualBtcReserve.plus(btcAfterFee);
  const newVirtualToken = K.div(newVirtualBtc).integerValue();
  const tokensOut = virtualTokenSupply.minus(newVirtualToken);

  const pricePerToken = tokensOut.isGreaterThan(0)
    ? btcAfterFee.div(tokensOut).toNumber()
    : 0;

  const spotPriceBefore = virtualBtcReserve.div(virtualTokenSupply).toNumber();
  const spotPriceAfter = newVirtualBtc.div(newVirtualToken).toNumber();
  const priceImpact = spotPriceBefore > 0
    ? ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100
    : 0;

  return {
    type: 'buy',
    inputAmount: btcInputSats,
    outputAmount: tokensOut.toNumber(),
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
  tokenInputUnits: number,
): TradeSimulation {
  const input = new BigNumber(tokenInputUnits);

  const newVirtualToken = virtualTokenSupply.plus(input);
  const newVirtualBtc = K.div(newVirtualToken).integerValue();
  const btcOutBeforeFee = virtualBtcReserve.minus(newVirtualBtc);

  const fee = btcOutBeforeFee.times(TOTAL_FEE_PERCENT).div(100).integerValue();
  const btcOut = btcOutBeforeFee.minus(fee);

  const pricePerToken = input.isGreaterThan(0)
    ? btcOut.div(input).toNumber()
    : 0;

  const spotPriceBefore = virtualBtcReserve.div(virtualTokenSupply).toNumber();
  const spotPriceAfter = newVirtualBtc.div(newVirtualToken).toNumber();
  const priceImpact = spotPriceBefore > 0
    ? ((spotPriceAfter - spotPriceBefore) / spotPriceBefore) * 100
    : 0;

  return {
    type: 'sell',
    inputAmount: tokenInputUnits,
    outputAmount: Math.max(0, btcOut.toNumber()),
    pricePerToken,
    priceImpactPercent: priceImpact,
    fee: fee.toNumber(),
    newPriceSats: spotPriceAfter,
    newVirtualBtc: newVirtualBtc.toFixed(0),
    newVirtualToken: newVirtualToken.toFixed(0),
  };
}

export function getCurrentPrice(virtualBtcReserve: BigNumber, virtualTokenSupply: BigNumber): number {
  return virtualBtcReserve.div(virtualTokenSupply).toNumber();
}

export function getGraduationProgress(realBtcReserveSats: number): number {
  return Math.min(100, (realBtcReserveSats / GRADUATION_THRESHOLD_SATS) * 100);
}

export function getMarketCap(priceSats: number, totalSupplyUnits: number): number {
  return priceSats * totalSupplyUnits;
}

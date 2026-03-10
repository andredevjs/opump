/**
 * Bonding curve simulator — copied from backend/src/services/BondingCurveSimulator.ts.
 * Pure computation, no external dependencies except shared constants.
 */

import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  TOTAL_FEE_BPS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  FEE_DENOMINATOR,
  MIN_TRADE_SATS,
  TOKEN_DECIMALS,
} from "../../../shared/constants/bonding-curve.js";

const DECIMALS_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);

export interface Reserves {
  virtualBtcReserve: bigint;
  virtualTokenSupply: bigint;
  kConstant: bigint;
  realBtcReserve: bigint;
}

export interface FeeBreakdown {
  platform: bigint;
  creator: bigint;
  minter: bigint;
  flywheel: bigint;
  total: bigint;
}

export interface BuySimulation {
  tokensOut: bigint;
  fees: FeeBreakdown;
  newReserves: Reserves;
  priceImpactBps: number;
  newPriceSats: bigint;
  effectivePriceSats: bigint;
}

export interface SellSimulation {
  btcOut: bigint;
  fees: FeeBreakdown;
  newReserves: Reserves;
  priceImpactBps: number;
  newPriceSats: bigint;
  effectivePriceSats: bigint;
}

export class BondingCurveSimulator {
  simulateBuy(
    reserves: Reserves,
    btcAmountSats: bigint,
    buyTaxBps: bigint = 0n,
  ): BuySimulation {
    if (btcAmountSats < MIN_TRADE_SATS) {
      throw new Error("Below minimum trade amount");
    }

    const priceBefore = this.calculatePrice(reserves.virtualBtcReserve, reserves.virtualTokenSupply);
    const fees = this.calculateFees(btcAmountSats, buyTaxBps);
    const netBtc = btcAmountSats - fees.total;

    const newVirtualBtc = reserves.virtualBtcReserve + netBtc;
    const newVirtualToken = reserves.kConstant / newVirtualBtc;
    const tokensOut = reserves.virtualTokenSupply - newVirtualToken;

    const newReserves: Reserves = {
      virtualBtcReserve: newVirtualBtc,
      virtualTokenSupply: newVirtualToken,
      kConstant: reserves.kConstant,
      realBtcReserve: reserves.realBtcReserve + netBtc,
    };

    const priceAfter = this.calculatePrice(newReserves.virtualBtcReserve, newReserves.virtualTokenSupply);
    const priceImpactBps = priceBefore > 0n
      ? Number(((priceAfter - priceBefore) * 10000n) / priceBefore)
      : 0;

    const effectivePriceSats = tokensOut > 0n ? (btcAmountSats * 100000000n) / tokensOut : 0n;

    return {
      tokensOut,
      fees,
      newReserves,
      priceImpactBps,
      newPriceSats: priceAfter,
      effectivePriceSats,
    };
  }

  simulateSell(
    reserves: Reserves,
    tokenAmount: bigint,
    sellTaxBps: bigint = 0n,
  ): SellSimulation {
    const priceBefore = this.calculatePrice(reserves.virtualBtcReserve, reserves.virtualTokenSupply);

    const newVirtualToken = reserves.virtualTokenSupply + tokenAmount;
    const newVirtualBtc = reserves.kConstant / newVirtualToken;
    const grossBtcOut = reserves.virtualBtcReserve - newVirtualBtc;

    if (grossBtcOut < MIN_TRADE_SATS) {
      throw new Error("Below minimum trade amount");
    }

    const fees = this.calculateFees(grossBtcOut, sellTaxBps);
    const btcOut = grossBtcOut - fees.total;

    const newReserves: Reserves = {
      virtualBtcReserve: newVirtualBtc,
      virtualTokenSupply: newVirtualToken,
      kConstant: reserves.kConstant,
      realBtcReserve: reserves.realBtcReserve - grossBtcOut,
    };

    const priceAfter = this.calculatePrice(newReserves.virtualBtcReserve, newReserves.virtualTokenSupply);
    const priceImpactBps = priceBefore > 0n
      ? Number(((priceBefore - priceAfter) * 10000n) / priceBefore)
      : 0;

    const effectivePriceSats = tokenAmount > 0n ? (grossBtcOut * 100000000n) / tokenAmount : 0n;

    return {
      btcOut,
      fees,
      newReserves,
      priceImpactBps,
      newPriceSats: priceAfter,
      effectivePriceSats,
    };
  }

  private calculateFees(amount: bigint, flywheelBps: bigint): FeeBreakdown {
    const platform = (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
    const creator = (amount * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
    const minter = (amount * MINTER_FEE_BPS) / FEE_DENOMINATOR;
    const flywheel = (amount * flywheelBps) / FEE_DENOMINATOR;
    const baseFee = (amount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
    const total = baseFee + flywheel;

    return { platform, creator, minter, flywheel, total };
  }

  calculatePrice(virtualBtc: bigint, virtualToken: bigint): bigint {
    if (virtualToken === 0n) return 0n;
    return (virtualBtc * DECIMALS_FACTOR) / virtualToken;
  }

  static getInitialReserves(): Reserves {
    return {
      virtualBtcReserve: INITIAL_VIRTUAL_BTC_SATS,
      virtualTokenSupply: INITIAL_VIRTUAL_TOKEN_SUPPLY,
      kConstant: K_CONSTANT,
      realBtcReserve: 0n,
    };
  }
}

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
  GRADUATION_THRESHOLD_SATS,
} from '../../../shared/constants/bonding-curve.js';

const DECIMALS_FACTOR = 10n ** BigInt(TOKEN_DECIMALS);

export interface Reserves {
  virtualBtcReserve: bigint;
  virtualTokenSupply: bigint;
  kConstant: bigint;
  realBtcReserve: bigint;
  graduationThreshold?: bigint;
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
  /**
   * Simulate a buy on the bonding curve.
   * Must produce identical results to the on-chain LaunchToken.buy().
   */
  simulateBuy(
    reserves: Reserves,
    btcAmountSats: bigint,
    buyTaxBps: bigint = 0n,
  ): BuySimulation {
    if (btcAmountSats < MIN_TRADE_SATS) {
      throw new Error('Below minimum trade amount');
    }

    const priceBefore = this.calculatePrice(reserves.virtualBtcReserve, reserves.virtualTokenSupply);

    // Calculate fees
    const fees = this.calculateFees(btcAmountSats, buyTaxBps);

    // Net BTC into curve
    const netBtc = btcAmountSats - fees.total;

    // Prevent buying beyond graduation threshold
    const graduationThreshold = reserves.graduationThreshold ?? GRADUATION_THRESHOLD_SATS;
    if (reserves.realBtcReserve + netBtc > graduationThreshold) {
      throw new Error('Exceeds graduation threshold');
    }

    // Calculate tokens out: tokensOut = vToken - (k / (vBtc + netBtc))
    const newVirtualBtc = reserves.virtualBtcReserve + netBtc;
    const newVirtualToken = reserves.kConstant / newVirtualBtc;
    const tokensOut = reserves.virtualTokenSupply - newVirtualToken;

    // New reserves
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

  /**
   * Simulate a sell on the bonding curve.
   * Must produce identical results to the on-chain LaunchToken.sell().
   */
  simulateSell(
    reserves: Reserves,
    tokenAmount: bigint,
    sellTaxBps: bigint = 0n,
  ): SellSimulation {
    const priceBefore = this.calculatePrice(reserves.virtualBtcReserve, reserves.virtualTokenSupply);

    // Calculate gross BTC out: btcOut = vBtc - (k / (vToken + tokenAmount))
    const newVirtualToken = reserves.virtualTokenSupply + tokenAmount;
    const newVirtualBtc = reserves.kConstant / newVirtualToken;
    const grossBtcOut = reserves.virtualBtcReserve - newVirtualBtc;

    if (grossBtcOut < MIN_TRADE_SATS) {
      throw new Error('Below minimum trade amount');
    }

    // Calculate fees on the gross output
    const fees = this.calculateFees(grossBtcOut, sellTaxBps);

    // Net BTC to seller
    const btcOut = grossBtcOut - fees.total;

    // New reserves
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

  /**
   * Calculate fee breakdown for a given amount.
   */
  private calculateFees(amount: bigint, flywheelBps: bigint): FeeBreakdown {
    const platform = (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
    const creator = (amount * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
    const minter = (amount * MINTER_FEE_BPS) / FEE_DENOMINATOR;
    const flywheel = (amount * flywheelBps) / FEE_DENOMINATOR;
    // Match the on-chain contract: total = (amount * TOTAL_FEE_BPS / FEE_DENOMINATOR) + flywheel
    const baseFee = (amount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
    const total = baseFee + flywheel;

    return { platform, creator, minter, flywheel, total };
  }

  /**
   * Calculate current price in sats per whole token.
   * Scales by 10^DECIMALS to convert from per-unit to per-token.
   */
  calculatePrice(virtualBtc: bigint, virtualToken: bigint): bigint {
    if (virtualToken === 0n) return 0n;
    return (virtualBtc * DECIMALS_FACTOR) / virtualToken;
  }

  /**
   * Get initial reserves for a freshly deployed token.
   */
  static getInitialReserves(): Reserves {
    return {
      virtualBtcReserve: INITIAL_VIRTUAL_BTC_SATS,
      virtualTokenSupply: INITIAL_VIRTUAL_TOKEN_SUPPLY,
      kConstant: K_CONSTANT,
      realBtcReserve: 0n,
    };
  }
}

import { u256 } from '@btc-vision/as-bignum/assembly';
import { SafeMath } from '@btc-vision/btc-runtime/runtime';
import {
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  TOKEN_DECIMALS_FACTOR,
} from './Constants';

/**
 * Bonding curve math library.
 * Constant-product AMM: k = virtualBtcReserve * virtualTokenSupply
 * All operations use SafeMath — no raw arithmetic.
 */
export class BondingCurve {
  /**
   * Calculate tokens out for a given BTC input.
   * tokensOut = virtualTokenSupply - (k / (virtualBtcReserve + netBtc))
   */
  static calculateBuy(
    virtualBtc: u256,
    virtualToken: u256,
    k: u256,
    btcIn: u256,
  ): u256 {
    const newVirtualBtc = SafeMath.add(virtualBtc, btcIn);
    const newVirtualToken = SafeMath.div(k, newVirtualBtc);
    return SafeMath.sub(virtualToken, newVirtualToken);
  }

  /**
   * Calculate BTC out for a given token input.
   * btcOut = virtualBtcReserve - (k / (virtualTokenSupply + tokenAmount))
   */
  static calculateSell(
    virtualBtc: u256,
    virtualToken: u256,
    k: u256,
    tokensIn: u256,
  ): u256 {
    const newVirtualToken = SafeMath.add(virtualToken, tokensIn);
    const newVirtualBtc = SafeMath.div(k, newVirtualToken);
    return SafeMath.sub(virtualBtc, newVirtualBtc);
  }

  /**
   * Calculate total fee amount: amount * TOTAL_FEE_BPS / FEE_DENOMINATOR
   */
  static calculateTotalFee(amount: u256): u256 {
    return SafeMath.div(SafeMath.mul(amount, TOTAL_FEE_BPS), FEE_DENOMINATOR);
  }

  /**
   * Calculate individual fee from amount using given bps.
   */
  static calculateFee(amount: u256, feeBps: u256): u256 {
    return SafeMath.div(SafeMath.mul(amount, feeBps), FEE_DENOMINATOR);
  }

  /**
   * Split the total fee into platform, creator, and minter portions.
   * Returns [platformFee, creatorFee, minterFee]
   */
  static splitFees(amount: u256): StaticArray<u256> {
    const total = BondingCurve.calculateTotalFee(amount);
    const platformFee = SafeMath.div(SafeMath.mul(amount, PLATFORM_FEE_BPS), FEE_DENOMINATOR);
    const creatorFee = SafeMath.div(SafeMath.mul(amount, CREATOR_FEE_BPS), FEE_DENOMINATOR);
    // Minter gets remainder to avoid dust loss from integer division
    const minterFee = SafeMath.sub(total, SafeMath.add(platformFee, creatorFee));
    const result = new StaticArray<u256>(3);
    result[0] = platformFee;
    result[1] = creatorFee;
    result[2] = minterFee;
    return result;
  }

  /**
   * Calculate price in sats per whole token.
   * Scales by 10^8 (TOKEN_DECIMALS_FACTOR) to convert from per-base-unit to per-token,
   * avoiding integer truncation to zero.
   */
  static calculatePrice(virtualBtc: u256, virtualToken: u256): u256 {
    if (virtualToken == u256.Zero) return u256.Zero;
    return SafeMath.div(SafeMath.mul(virtualBtc, TOKEN_DECIMALS_FACTOR), virtualToken);
  }
}

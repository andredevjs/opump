/**
 * Bonding curve test vectors for cross-layer consistency verification.
 * Uses the canonical exponential curve: Price(x) = a * e^(b*x).
 *
 * All expected values are pre-computed using the shared BigInt math
 * (deriveParams, calculateBuyCost, calculateSellPayout, calculatePrice).
 */
import {
  deriveParams,
  calculateBuyCost,
  calculateSellPayout,
  calculatePrice,
} from '../lib/bonding-curve.ts';
import {
  DEFAULT_MAX_SUPPLY,
  GRADUATION_THRESHOLD_SATS,
} from './bonding-curve.ts';

export interface ExpCurveTestVector {
  name: string;
  input: {
    aScaled: bigint;
    bScaled: bigint;
    currentSupplyOnCurve: bigint;
    amount: bigint; // sats for buy, token-units for sell
  };
  expectedBuy: {
    cost: bigint; // sats (ceil)
  };
  expectedSell: {
    payout: bigint; // sats (floor)
  };
  expectedPrice: bigint; // price * PRICE_PRECISION
}

// Default curve parameters
const { aScaled, bScaled } = deriveParams(DEFAULT_MAX_SUPPLY, GRADUATION_THRESHOLD_SATS);

function makeVector(
  name: string,
  supply: bigint,
  amount: bigint,
): ExpCurveTestVector {
  return {
    name,
    input: { aScaled, bScaled, currentSupplyOnCurve: supply, amount },
    expectedBuy: {
      cost: calculateBuyCost(aScaled, bScaled, supply, amount),
    },
    expectedSell: {
      payout: supply >= amount
        ? calculateSellPayout(aScaled, bScaled, supply, amount)
        : 0n,
    },
    expectedPrice: calculatePrice(aScaled, bScaled, supply),
  };
}

// Supplies at various points
const ZERO = 0n;
const SMALL_SUPPLY = 1_000_000_000_000n; // 10k whole tokens
const MED_SUPPLY = 10_000_000_000_000_000n; // 100M whole tokens (10% of curve)
const LARGE_SUPPLY = 50_000_000_000_000_000n; // 500M whole tokens (50% of curve)

// Amounts
const MIN_AMOUNT = 10_000n; // min trade sats / small token amount
const SMALL_AMOUNT = 100_000n;
const MED_AMOUNT = 1_000_000n;
const LARGE_AMOUNT = 10_000_000n;
const WHALE_AMOUNT = 100_000_000n;

export const EXP_CURVE_TEST_VECTORS: ExpCurveTestVector[] = [
  makeVector('Initial price at zero supply, min amount', ZERO, MIN_AMOUNT),
  makeVector('Initial price at zero supply, small amount', ZERO, SMALL_AMOUNT),
  makeVector('Initial price at zero supply, medium amount', ZERO, MED_AMOUNT),
  makeVector('Initial price at zero supply, large amount', ZERO, LARGE_AMOUNT),
  makeVector('Small supply, min amount', SMALL_SUPPLY, MIN_AMOUNT),
  makeVector('Small supply, medium amount', SMALL_SUPPLY, MED_AMOUNT),
  makeVector('Medium supply (10%), small amount', MED_SUPPLY, SMALL_AMOUNT),
  makeVector('Medium supply (10%), large amount', MED_SUPPLY, LARGE_AMOUNT),
  makeVector('Large supply (50%), medium amount', LARGE_SUPPLY, MED_AMOUNT),
  makeVector('Large supply (50%), whale amount', LARGE_SUPPLY, WHALE_AMOUNT),
];

// Re-export derived params for tests that need them
export { aScaled, bScaled };

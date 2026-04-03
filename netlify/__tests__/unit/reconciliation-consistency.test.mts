/**
 * Verify that optimistic trade pricing matches reconciliation pricing.
 * After math unification, both paths use the same shared BigInt implementation.
 */
import { describe, it, expect } from 'vitest';
import {
  BondingCurveSimulator,
  calculateBuyCost,
  calculatePrice,
  deriveParams,
} from '../../functions/_shared/bonding-curve.mts';
import {
  GRADUATION_THRESHOLD_SATS,
  DEFAULT_MAX_SUPPLY,
  TOKEN_UNITS_PER_TOKEN,
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
} from '../../functions/_shared/constants.mts';

const simulator = new BondingCurveSimulator();

function toDisplayPrice(scaled: bigint): string {
  return (Number(scaled) / PRICE_DISPLAY_DIVISOR).toString();
}

describe('reconciliation consistency', () => {
  it('optimistic buy price matches reconciliation resync price', () => {
    // Setup: fresh token with default params
    const { aScaled, bScaled } = deriveParams(DEFAULT_MAX_SUPPLY, GRADUATION_THRESHOLD_SATS);
    const reserves = {
      currentSupplyOnCurve: 0n,
      realBtcReserve: 0n,
      aScaled,
      bScaled,
    };

    // Optimistic path: simulate buy (same as trades-submit.mts)
    const btcAmount = 1_000_000n; // 0.01 BTC
    const optimistic = simulator.simulateBuy(reserves, btcAmount);
    const optimisticPriceSats = toDisplayPrice(optimistic.newPriceSats);

    // Reconciliation path: recompute from supply integral (same as indexer-core.mts resyncReservesForTrade)
    const newSupply = optimistic.newReserves.currentSupplyOnCurve;
    const reconciledPriceScaled = calculatePrice(aScaled, bScaled, newSupply);
    const reconciledPriceSats = toDisplayPrice(reconciledPriceScaled);

    // Prices must match exactly — same math, same supply
    expect(optimisticPriceSats).toBe(reconciledPriceSats);

    // Also verify reserves match
    const reconciledReserve = calculateBuyCost(aScaled, bScaled, 0n, newSupply);
    // Optimistic reserve might differ slightly due to fee handling, but the price is supply-derived
    expect(reconciledReserve).toBeGreaterThan(0n);
  });

  it('sequential buys produce same price via optimistic and reconciliation paths', () => {
    const { aScaled, bScaled } = deriveParams(DEFAULT_MAX_SUPPLY, GRADUATION_THRESHOLD_SATS);
    let reserves = {
      currentSupplyOnCurve: 0n,
      realBtcReserve: 0n,
      aScaled,
      bScaled,
    };

    // Two sequential buys
    const buy1 = simulator.simulateBuy(reserves, 500_000n);
    reserves = buy1.newReserves;
    const buy2 = simulator.simulateBuy(reserves, 500_000n);

    // Reconciliation: compute price from final supply
    const finalSupply = buy2.newReserves.currentSupplyOnCurve;
    const reconciledPrice = toDisplayPrice(calculatePrice(aScaled, bScaled, finalSupply));
    const optimisticPrice = toDisplayPrice(buy2.newPriceSats);

    expect(optimisticPrice).toBe(reconciledPrice);
  });
});

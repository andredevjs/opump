/**
 * Cross-layer conformance: verify the canonical shared math produces
 * exact expected outputs for each test vector.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateBuyCost,
  calculateSellPayout,
  calculatePrice,
} from '../lib/bonding-curve.ts';
import { EXP_CURVE_TEST_VECTORS } from '../constants/test-vectors.ts';

describe('cross-layer conformance', () => {
  for (const v of EXP_CURVE_TEST_VECTORS) {
    describe(v.name, () => {
      const { aScaled, bScaled, currentSupplyOnCurve, amount } = v.input;

      it('calculateBuyCost matches expected', () => {
        const cost = calculateBuyCost(aScaled, bScaled, currentSupplyOnCurve, amount);
        expect(cost).toBe(v.expectedBuy.cost);
      });

      if (v.expectedSell.payout > 0n) {
        it('calculateSellPayout matches expected', () => {
          const payout = calculateSellPayout(aScaled, bScaled, currentSupplyOnCurve, amount);
          expect(payout).toBe(v.expectedSell.payout);
        });
      }

      it('calculatePrice matches expected', () => {
        const price = calculatePrice(aScaled, bScaled, currentSupplyOnCurve);
        expect(price).toBe(v.expectedPrice);
      });
    });
  }
});

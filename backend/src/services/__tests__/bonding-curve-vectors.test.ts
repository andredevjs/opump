import { describe, it, expect } from 'vitest';
import { TEST_VECTORS } from '../../../../shared/constants/test-vectors.js';
import {
  TOTAL_FEE_BPS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  FEE_DENOMINATOR,
} from '../../../../shared/constants/bonding-curve.js';

describe('Bonding Curve Test Vectors', () => {
  describe('buy calculations', () => {
    for (const v of TEST_VECTORS) {
      it(`${v.name} — buy`, () => {
        const { virtualBtcReserve, virtualTokenSupply, kConstant, amount } = v.input;

        const newVirtualBtcReserve = virtualBtcReserve + amount;
        const newVirtualTokenSupply = kConstant / newVirtualBtcReserve;
        const tokensOut = virtualTokenSupply - newVirtualTokenSupply;

        expect(tokensOut).toBe(v.expectedBuy.tokensOut);
        expect(newVirtualBtcReserve).toBe(v.expectedBuy.newVirtualBtcReserve);
        expect(newVirtualTokenSupply).toBe(v.expectedBuy.newVirtualTokenSupply);
      });
    }
  });

  describe('sell calculations', () => {
    for (const v of TEST_VECTORS) {
      it(`${v.name} — sell`, () => {
        const { virtualBtcReserve, virtualTokenSupply, kConstant, amount } = v.input;

        const newVirtualTokenSupply = virtualTokenSupply + amount;
        const newVirtualBtcReserve = kConstant / newVirtualTokenSupply;
        const btcOut = virtualBtcReserve - newVirtualBtcReserve;

        expect(btcOut).toBe(v.expectedSell.btcOut);
        expect(newVirtualBtcReserve).toBe(v.expectedSell.newVirtualBtcReserve);
        expect(newVirtualTokenSupply).toBe(v.expectedSell.newVirtualTokenSupply);
      });
    }
  });

  describe('fee calculations', () => {
    const testAmounts = [10_000n, 100_000n, 1_000_000n, 10_000_000n, 100_000_000n];

    for (const amount of testAmounts) {
      it(`total fee = 1.5% of ${amount} sats`, () => {
        const totalFee = (amount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
        const platformFee = (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
        const creatorFee = (amount * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
        const minterFee = (amount * MINTER_FEE_BPS) / FEE_DENOMINATOR;

        // Total = platform + creator + minter
        expect(platformFee + creatorFee + minterFee).toBe(totalFee);

        // Verify individual rates
        expect(totalFee).toBe((amount * 150n) / 10_000n);
        expect(platformFee).toBe((amount * 100n) / 10_000n);
        expect(creatorFee).toBe((amount * 25n) / 10_000n);
        expect(minterFee).toBe((amount * 25n) / 10_000n);
      });
    }
  });

  describe('invariants', () => {
    it('k constant is preserved across buy operations', () => {
      for (const v of TEST_VECTORS) {
        const product = v.expectedBuy.newVirtualBtcReserve * v.expectedBuy.newVirtualTokenSupply;
        // Due to integer division, product <= k (truncation loses at most newVirtualBtcReserve - 1)
        expect(product).toBeLessThanOrEqual(v.input.kConstant);
        expect(product).toBeGreaterThan(v.input.kConstant - v.expectedBuy.newVirtualBtcReserve);
      }
    });

    it('k constant is preserved across sell operations', () => {
      for (const v of TEST_VECTORS) {
        const product = v.expectedSell.newVirtualBtcReserve * v.expectedSell.newVirtualTokenSupply;
        expect(product).toBeLessThanOrEqual(v.input.kConstant);
        expect(product).toBeGreaterThan(v.input.kConstant - v.expectedSell.newVirtualTokenSupply);
      }
    });

    it('buy tokensOut is always positive', () => {
      for (const v of TEST_VECTORS) {
        expect(v.expectedBuy.tokensOut).toBeGreaterThan(0n);
      }
    });

    it('sell btcOut matches expected value for all vectors', () => {
      for (const v of TEST_VECTORS) {
        const { virtualBtcReserve, virtualTokenSupply, kConstant, amount } = v.input;
        const newVirtualTokenSupply = virtualTokenSupply + amount;
        const newVirtualBtcReserve = kConstant / newVirtualTokenSupply;
        const btcOut = virtualBtcReserve - newVirtualBtcReserve;
        expect(btcOut).toBe(v.expectedSell.btcOut);
      }
    });
  });
});

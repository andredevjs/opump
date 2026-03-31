import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { calculateBuy, calculateSell, getCurrentPrice, getGraduationProgress, getMarketCap } from '../bonding-curve';

// Pre-computed from: curveSupply=1e17, gradThreshold=6900000
const A_SCALED = new BigNumber('401338085046');
const B_SCALED = new BigNumber('5756462732');
const ZERO_SUPPLY = new BigNumber('0');

describe('bonding-curve', () => {
  describe('calculateBuy', () => {
    it('returns correct output for a small buy', () => {
      const result = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '100000');

      expect(result).not.toBeNull();
      expect(result!.type).toBe('buy');
      expect(result!.inputAmount).toBe('100000');
      expect(Number(result!.outputAmount)).toBeGreaterThan(0);
      expect(result!.fee).toBeGreaterThan(0);
      expect(result!.priceImpactPercent).toBeGreaterThan(0);
      expect(result!.newPriceSats).toBeGreaterThan(0);
    });

    it('deducts 1.25% fee from input (rounded up)', () => {
      const result = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '1000000');
      // Fee should be ceil(1.25% of input) = ceil(12500) = 12500 sats
      expect(result!.fee).toBe(12500);
    });

    it('increases supply on curve', () => {
      const result = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '1000000')!;
      expect(new BigNumber(result.newSupplyOnCurve).isGreaterThan(0)).toBe(true);
    });

    it('larger buys produce larger price impact', () => {
      const small = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '100000')!;
      const large = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '10000000')!;
      expect(large.priceImpactPercent).toBeGreaterThan(small.priceImpactPercent);
    });

    it('larger buys produce more tokens but at worse effective price', () => {
      const small = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '100000')!;
      const large = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '10000000')!;
      expect(Number(large.outputAmount)).toBeGreaterThan(Number(small.outputAmount));
      expect(large.pricePerToken).toBeGreaterThan(small.pricePerToken);
    });

    it('returns null for zero input', () => {
      expect(calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '0')).toBeNull();
    });

    it('returns null for NaN input', () => {
      expect(calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '')).toBeNull();
      expect(calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, 'abc')).toBeNull();
    });

    it('returns null for negative input', () => {
      expect(calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '-100')).toBeNull();
    });

    it('handles sequential buys correctly (price increases)', () => {
      const buy1 = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '1000000')!;
      const newSupply = new BigNumber(buy1.newSupplyOnCurve);

      const buy2 = calculateBuy(newSupply, A_SCALED, B_SCALED, '1000000')!;

      // Second buy should get fewer tokens (price went up)
      expect(Number(buy2.outputAmount)).toBeLessThan(Number(buy1.outputAmount));
      expect(buy2.newPriceSats).toBeGreaterThan(buy1.newPriceSats);
    });
  });

  describe('calculateSell', () => {
    it('returns correct output for a sell', () => {
      const buy = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '1000000')!;
      const newSupply = new BigNumber(buy.newSupplyOnCurve);
      const sell = calculateSell(newSupply, A_SCALED, B_SCALED, buy.outputAmount)!;

      expect(sell.type).toBe('sell');
      expect(Number(sell.outputAmount)).toBeGreaterThan(0);
      expect(sell.fee).toBeGreaterThan(0);
    });

    it('selling all tokens back yields less than input (due to fees)', () => {
      const btcInput = '1000000';
      const buy = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, btcInput)!;
      const newSupply = new BigNumber(buy.newSupplyOnCurve);
      const sell = calculateSell(newSupply, A_SCALED, B_SCALED, buy.outputAmount)!;

      expect(Number(sell.outputAmount)).toBeLessThan(Number(btcInput));
    });

    it('has negative price impact (price goes down)', () => {
      const buy = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '1000000')!;
      const sell = calculateSell(
        new BigNumber(buy.newSupplyOnCurve), A_SCALED, B_SCALED, buy.outputAmount,
      )!;
      expect(sell.priceImpactPercent).toBeLessThan(0);
    });

    it('returns null for zero input', () => {
      expect(calculateSell(ZERO_SUPPLY, A_SCALED, B_SCALED, '0')).toBeNull();
    });

    it('returns null for invalid input', () => {
      expect(calculateSell(ZERO_SUPPLY, A_SCALED, B_SCALED, '')).toBeNull();
      expect(calculateSell(ZERO_SUPPLY, A_SCALED, B_SCALED, '-5')).toBeNull();
    });
  });

  describe('getCurrentPrice', () => {
    it('returns initial price from zero supply', () => {
      const price = getCurrentPrice(ZERO_SUPPLY, A_SCALED, B_SCALED);
      // Initial price = a = A_SCALED / 1e18 ≈ 0.000401 sats/token
      const a = A_SCALED.div(1e18).toNumber();
      expect(price).toBeCloseTo(a, 8);
    });

    it('increases after a buy', () => {
      const priceBefore = getCurrentPrice(ZERO_SUPPLY, A_SCALED, B_SCALED);
      const buy = calculateBuy(ZERO_SUPPLY, A_SCALED, B_SCALED, '1000000')!;
      const priceAfter = getCurrentPrice(new BigNumber(buy.newSupplyOnCurve), A_SCALED, B_SCALED);
      expect(priceAfter).toBeGreaterThan(priceBefore);
    });

    it('price at graduation is ~100x initial', () => {
      // 80% of 1B tokens = 800M whole tokens = 8e16 units
      const gradSupply = new BigNumber('80000000000000000');
      const gradPrice = getCurrentPrice(gradSupply, A_SCALED, B_SCALED);
      const initPrice = getCurrentPrice(ZERO_SUPPLY, A_SCALED, B_SCALED);
      const multiplier = gradPrice / initPrice;
      expect(multiplier).toBeCloseTo(100, 0);
    });
  });

  describe('getGraduationProgress', () => {
    it('returns 0 for 0 reserve', () => {
      expect(getGraduationProgress(0)).toBe(0);
    });

    it('returns 50 for half the threshold', () => {
      expect(getGraduationProgress(3_450_000)).toBe(50);
    });

    it('caps at 100', () => {
      expect(getGraduationProgress(10_000_000)).toBe(100);
    });

    it('returns exact 100 at threshold', () => {
      expect(getGraduationProgress(6_900_000)).toBe(100);
    });
  });

  describe('getMarketCap', () => {
    it('calculates market cap as price * supply (returned as string)', () => {
      const priceSats = 0.000401;
      const supply = '100000000000000000'; // 1B tokens * 10^8
      const result = getMarketCap(priceSats, supply);
      // 0.000401 * 1e17 = 40100000000000
      expect(result).toBe('40100000000000');
    });

    it('returns "0" for zero price', () => {
      expect(getMarketCap(0, '100000000000000000')).toBe('0');
    });
  });
});

import { describe, it, expect } from 'vitest';
import BigNumber from 'bignumber.js';
import { calculateBuy, calculateSell, getCurrentPrice, getGraduationProgress, getMarketCap } from '../bonding-curve';

// Initial virtual reserves from constants
const INITIAL_VIRTUAL_BTC = new BigNumber('3000000000'); // 30 BTC in sats
const INITIAL_VIRTUAL_TOKEN = new BigNumber('100000000000000000'); // 1B tokens * 10^8
const TOKEN_UNITS_PER_TOKEN = 100_000_000;

describe('bonding-curve', () => {
  describe('calculateBuy', () => {
    it('returns correct output for a small buy', () => {
      const result = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '100000'); // 100k sats

      expect(result).not.toBeNull();
      expect(result!.type).toBe('buy');
      expect(result!.inputAmount).toBe('100000');
      expect(Number(result!.outputAmount)).toBeGreaterThan(0);
      expect(result!.fee).toBeGreaterThan(0);
      expect(result!.priceImpactPercent).toBeGreaterThan(0);
      expect(result!.newPriceSats).toBeGreaterThan(0);
    });

    it('deducts 1.5% fee from input (rounded up)', () => {
      const btcInput = '1000000'; // 1M sats
      const result = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, btcInput);

      // Fee should be ceil(1.5% of input) = ceil(15000) = 15000 sats
      expect(result!.fee).toBe(15000);
    });

    it('increases the BTC reserve and decreases token supply', () => {
      const result = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;

      expect(new BigNumber(result.newVirtualBtc).isGreaterThan(INITIAL_VIRTUAL_BTC)).toBe(true);
      expect(new BigNumber(result.newVirtualToken).isLessThan(INITIAL_VIRTUAL_TOKEN)).toBe(true);
    });

    it('preserves k constant (approximately)', () => {
      const result = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;

      const newK = new BigNumber(result.newVirtualBtc).times(result.newVirtualToken);
      const originalK = INITIAL_VIRTUAL_BTC.times(INITIAL_VIRTUAL_TOKEN);

      // k should be preserved (within rounding)
      // newVirtualToken = floor(K / newVirtualBtc), so newK <= originalK
      expect(newK.isLessThanOrEqualTo(originalK)).toBe(true);
      // But very close
      const diff = originalK.minus(newK);
      expect(diff.isLessThan(new BigNumber(result.newVirtualBtc))).toBe(true);
    });

    it('larger buys produce larger price impact', () => {
      const small = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '100000')!;
      const large = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '10000000')!;

      expect(large.priceImpactPercent).toBeGreaterThan(small.priceImpactPercent);
    });

    it('larger buys produce more tokens but at worse effective price', () => {
      const small = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '100000')!;
      const large = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '10000000')!;

      expect(Number(large.outputAmount)).toBeGreaterThan(Number(small.outputAmount));
      // Effective price (sats per token) should be higher for larger buys (worse)
      expect(large.pricePerToken).toBeGreaterThan(small.pricePerToken);
    });

    it('returns null for zero input', () => {
      const result = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '0');
      expect(result).toBeNull();
    });

    it('returns null for NaN input', () => {
      expect(calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '')).toBeNull();
      expect(calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, 'abc')).toBeNull();
      expect(calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, 'NaN')).toBeNull();
    });

    it('returns null for negative input', () => {
      expect(calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '-100')).toBeNull();
    });

    it('handles sequential buys correctly (price increases)', () => {
      const buy1 = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;
      const newBtc = new BigNumber(buy1.newVirtualBtc);
      const newToken = new BigNumber(buy1.newVirtualToken);

      const buy2 = calculateBuy(newBtc, newToken, '1000000')!;

      // Second buy should get fewer tokens (price went up)
      expect(Number(buy2.outputAmount)).toBeLessThan(Number(buy1.outputAmount));
      // Price should be higher after second buy
      expect(buy2.newPriceSats).toBeGreaterThan(buy1.newPriceSats);
    });
  });

  describe('calculateSell', () => {
    it('returns correct output for a sell', () => {
      // First buy some tokens
      const buy = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;
      const newBtc = new BigNumber(buy.newVirtualBtc);
      const newToken = new BigNumber(buy.newVirtualToken);

      // Sell all tokens back
      const sell = calculateSell(newBtc, newToken, buy.outputAmount)!;

      expect(sell.type).toBe('sell');
      expect(Number(sell.outputAmount)).toBeGreaterThan(0);
      expect(sell.fee).toBeGreaterThan(0);
    });

    it('selling all tokens back yields less than input (due to fees)', () => {
      const btcInput = '1000000';
      const buy = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, btcInput)!;
      const newBtc = new BigNumber(buy.newVirtualBtc);
      const newToken = new BigNumber(buy.newVirtualToken);

      const sell = calculateSell(newBtc, newToken, buy.outputAmount)!;

      // Should get less BTC back than invested (fees on both sides)
      expect(Number(sell.outputAmount)).toBeLessThan(Number(btcInput));
    });

    it('deducts 1.5% fee from gross BTC output (rounded up)', () => {
      const buy = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;
      const newBtc = new BigNumber(buy.newVirtualBtc);
      const newToken = new BigNumber(buy.newVirtualToken);

      const sell = calculateSell(newBtc, newToken, buy.outputAmount)!;

      // Fee is ceil(1.5% of grossBtcOut)
      const grossBtcOut = Number(sell.outputAmount) + sell.fee;
      const expectedFee = Math.ceil(grossBtcOut * 0.015);
      expect(sell.fee).toBe(expectedFee);
    });

    it('decreases BTC reserve and increases token supply', () => {
      const buy = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;
      const postBuyBtc = new BigNumber(buy.newVirtualBtc);
      const postBuyToken = new BigNumber(buy.newVirtualToken);

      const sell = calculateSell(postBuyBtc, postBuyToken, buy.outputAmount)!;

      expect(new BigNumber(sell.newVirtualBtc).isLessThan(postBuyBtc)).toBe(true);
      expect(new BigNumber(sell.newVirtualToken).isGreaterThan(postBuyToken)).toBe(true);
    });

    it('has negative price impact (price goes down)', () => {
      const buy = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;
      const sell = calculateSell(
        new BigNumber(buy.newVirtualBtc),
        new BigNumber(buy.newVirtualToken),
        buy.outputAmount,
      )!;

      expect(sell.priceImpactPercent).toBeLessThan(0);
    });

    it('prevents negative BTC output', () => {
      const result = calculateSell(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1')!;

      // Even tiny sells should not produce negative output
      expect(Number(result.outputAmount)).toBeGreaterThanOrEqual(0);
    });

    it('returns null for zero input', () => {
      expect(calculateSell(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '0')).toBeNull();
    });

    it('returns null for invalid input', () => {
      expect(calculateSell(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '')).toBeNull();
      expect(calculateSell(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '-5')).toBeNull();
    });
  });

  describe('getCurrentPrice', () => {
    it('returns initial price from initial reserves', () => {
      const price = getCurrentPrice(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN);

      // Price = virtualBtc * TOKEN_UNITS_PER_TOKEN / virtualToken
      // = 3_000_000_000 * 100_000_000 / 100_000_000_000_000_000
      // = 300_000_000_000_000_000 / 100_000_000_000_000_000
      // = 3
      expect(price).toBe(3);
    });

    it('returns 0 for zero token supply', () => {
      expect(getCurrentPrice(INITIAL_VIRTUAL_BTC, new BigNumber(0))).toBe(0);
    });

    it('increases after a buy', () => {
      const priceBefore = getCurrentPrice(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN);
      const buy = calculateBuy(INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, '1000000')!;
      const priceAfter = getCurrentPrice(
        new BigNumber(buy.newVirtualBtc),
        new BigNumber(buy.newVirtualToken),
      );

      expect(priceAfter).toBeGreaterThan(priceBefore);
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
      const priceSats = 3; // sats per token-unit
      const supply = '100000000000000000'; // 1B tokens * 10^8
      const result = getMarketCap(priceSats, supply);

      // Returns string to avoid Number overflow
      expect(result).toBe('300000000000000000');
    });

    it('returns "0" for zero price', () => {
      expect(getMarketCap(0, '100000000000000000')).toBe('0');
    });
  });
});

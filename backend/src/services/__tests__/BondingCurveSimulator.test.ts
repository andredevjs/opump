import { describe, it, expect } from 'vitest';
import { BondingCurveSimulator, type Reserves } from '../BondingCurveSimulator.js';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  MIN_TRADE_SATS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  TOKEN_DECIMALS,
} from '../../../../shared/constants/bonding-curve.js';

const simulator = new BondingCurveSimulator();

function initialReserves(): Reserves {
  return BondingCurveSimulator.getInitialReserves();
}

/** Reserves with a very high graduation threshold for large-amount tests. */
function largeCapReserves(): Reserves {
  return {
    ...BondingCurveSimulator.getInitialReserves(),
    graduationThreshold: 100_000_000_000n, // 1000 BTC — effectively no cap
  };
}

describe('BondingCurveSimulator', () => {
  describe('getInitialReserves', () => {
    it('returns correct initial values', () => {
      const reserves = initialReserves();

      expect(reserves.virtualBtcReserve).toBe(INITIAL_VIRTUAL_BTC_SATS);
      expect(reserves.virtualTokenSupply).toBe(INITIAL_VIRTUAL_TOKEN_SUPPLY);
      expect(reserves.kConstant).toBe(K_CONSTANT);
      expect(reserves.realBtcReserve).toBe(0n);
    });

    it('k = virtualBtc * virtualToken', () => {
      const reserves = initialReserves();

      expect(reserves.kConstant).toBe(
        reserves.virtualBtcReserve * reserves.virtualTokenSupply,
      );
    });
  });

  describe('calculatePrice', () => {
    it('returns initial price', () => {
      const price = simulator.calculatePrice(INITIAL_VIRTUAL_BTC_SATS, INITIAL_VIRTUAL_TOKEN_SUPPLY);

      // price = (767_000 * 10^18) / 100_000_000_000_000_000 = 7_670_000
      const PRICE_PRECISION_LOCAL = 10n ** 18n;
      const expected = (INITIAL_VIRTUAL_BTC_SATS * PRICE_PRECISION_LOCAL) / INITIAL_VIRTUAL_TOKEN_SUPPLY;
      expect(price).toBe(expected);
      expect(price).toBe(7_670_000n);
    });

    it('returns 0 for zero token supply', () => {
      expect(simulator.calculatePrice(1000n, 0n)).toBe(0n);
    });

    it('increases when BTC reserve increases relative to tokens', () => {
      const price1 = simulator.calculatePrice(3_000_000_000n, 100_000_000_000_000_000n);
      // Use significantly different reserves to overcome integer truncation
      const price2 = simulator.calculatePrice(6_000_000_000n, 50_000_000_000_000_000n);

      expect(price2).toBeGreaterThan(price1);
    });
  });

  describe('simulateBuy', () => {
    it('throws for below minimum trade amount', () => {
      expect(() =>
        simulator.simulateBuy(initialReserves(), MIN_TRADE_SATS - 1n),
      ).toThrow('Below minimum trade amount');
    });

    it('accepts minimum trade amount', () => {
      expect(() =>
        simulator.simulateBuy(initialReserves(), MIN_TRADE_SATS),
      ).not.toThrow();
    });

    it('returns positive tokens out', () => {
      const result = simulator.simulateBuy(initialReserves(), 100_000n);

      expect(result.tokensOut).toBeGreaterThan(0n);
    });

    it('calculates correct fee breakdown', () => {
      const btcAmount = 1_000_000n;
      const result = simulator.simulateBuy(initialReserves(), btcAmount);

      // Base fees
      const expectedPlatform = (btcAmount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
      const expectedCreator = (btcAmount * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
      const expectedMinter = (btcAmount * MINTER_FEE_BPS) / FEE_DENOMINATOR;
      const expectedTotal = (btcAmount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;

      expect(result.fees.platform).toBe(expectedPlatform);
      expect(result.fees.creator).toBe(expectedCreator);
      expect(result.fees.minter).toBe(expectedMinter);
      expect(result.fees.flywheel).toBe(0n); // no flywheel by default
      expect(result.fees.total).toBe(expectedTotal);
    });

    it('applies flywheel tax on top of base fee', () => {
      const btcAmount = 1_000_000n;
      const buyTaxBps = 200n; // 2%
      const result = simulator.simulateBuy(initialReserves(), btcAmount, buyTaxBps);

      const expectedFlywheel = (btcAmount * buyTaxBps) / FEE_DENOMINATOR;
      const expectedBaseFee = (btcAmount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;

      expect(result.fees.flywheel).toBe(expectedFlywheel);
      expect(result.fees.total).toBe(expectedBaseFee + expectedFlywheel);
    });

    it('net BTC goes into the curve correctly', () => {
      const btcAmount = 1_000_000n;
      const result = simulator.simulateBuy(initialReserves(), btcAmount);

      const netBtc = btcAmount - result.fees.total;
      const expectedNewVirtualBtc = INITIAL_VIRTUAL_BTC_SATS + netBtc;

      expect(result.newReserves.virtualBtcReserve).toBe(expectedNewVirtualBtc);
    });

    it('preserves k constant (integer division)', () => {
      const result = simulator.simulateBuy(initialReserves(), 1_000_000n);

      // newVirtualToken = k / newVirtualBtc (integer division)
      const expectedNewToken = K_CONSTANT / result.newReserves.virtualBtcReserve;
      expect(result.newReserves.virtualTokenSupply).toBe(expectedNewToken);
    });

    it('tokensOut = oldVirtualToken - newVirtualToken', () => {
      const result = simulator.simulateBuy(initialReserves(), 1_000_000n);

      expect(result.tokensOut).toBe(
        INITIAL_VIRTUAL_TOKEN_SUPPLY - result.newReserves.virtualTokenSupply,
      );
    });

    it('updates realBtcReserve', () => {
      const btcAmount = 1_000_000n;
      const result = simulator.simulateBuy(initialReserves(), btcAmount);

      const netBtc = btcAmount - result.fees.total;
      expect(result.newReserves.realBtcReserve).toBe(netBtc);
    });

    it('price impact is positive for buys (large enough to show)', () => {
      // Need a large buy relative to 0.00767 BTC virtual reserve for visible impact
      const result = simulator.simulateBuy(largeCapReserves(), 500_000_000n); // 5 BTC

      expect(result.priceImpactBps).toBeGreaterThan(0);
    });

    it('larger buys have larger price impact', () => {
      const small = simulator.simulateBuy(largeCapReserves(), 500_000_000n); // 5 BTC
      const large = simulator.simulateBuy(largeCapReserves(), 2_000_000_000n); // 20 BTC

      expect(large.priceImpactBps).toBeGreaterThan(small.priceImpactBps);
    });

    it('sequential buys yield diminishing tokens', () => {
      const buy1 = simulator.simulateBuy(initialReserves(), 1_000_000n);
      const buy2 = simulator.simulateBuy(buy1.newReserves, 1_000_000n);

      expect(buy2.tokensOut).toBeLessThan(buy1.tokensOut);
    });

    it('calculates effective price per token', () => {
      const btcAmount = 1_000_000n;
      const result = simulator.simulateBuy(initialReserves(), btcAmount);

      // effectivePrice = btcAmount * PRICE_PRECISION / tokensOut (10^18 precision)
      const PRICE_PRECISION_LOCAL = 10n ** 18n;
      const expected = (btcAmount * PRICE_PRECISION_LOCAL) / result.tokensOut;
      expect(result.effectivePriceSats).toBe(expected);
    });

    it('new price is higher than before (large buy)', () => {
      const reserves = largeCapReserves();
      const priceBefore = simulator.calculatePrice(reserves.virtualBtcReserve, reserves.virtualTokenSupply);
      // Large buy to visibly move price past integer truncation
      const result = simulator.simulateBuy(reserves, 500_000_000n);

      expect(result.newPriceSats).toBeGreaterThan(priceBefore);
    });
  });

  describe('simulateSell', () => {
    it('throws when selling from initial reserves (no real BTC)', () => {
      // Initial reserves have realBtcReserve=0, so any sell exceeds it
      expect(() =>
        simulator.simulateSell(initialReserves(), 1n),
      ).toThrow('Insufficient real BTC reserve');
    });

    it('returns positive BTC out for meaningful sell', () => {
      // First buy to have tokens
      const buyResult = simulator.simulateBuy(initialReserves(), 1_000_000n);
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      expect(sellResult.btcOut).toBeGreaterThan(0n);
    });

    it('buy-then-sell yields less BTC than input (round-trip loss)', () => {
      const btcInput = 1_000_000n;
      const buyResult = simulator.simulateBuy(initialReserves(), btcInput);
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      // Two-sided fees mean you get less back
      expect(sellResult.btcOut).toBeLessThan(btcInput);
    });

    it('calculates correct fee breakdown on sell', () => {
      const buyResult = simulator.simulateBuy(initialReserves(), 1_000_000n);
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      // Fees are calculated on grossBtcOut
      const grossBtcOut = sellResult.btcOut + sellResult.fees.total;
      const expectedPlatform = (grossBtcOut * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
      const expectedCreator = (grossBtcOut * CREATOR_FEE_BPS) / FEE_DENOMINATOR;

      expect(sellResult.fees.platform).toBe(expectedPlatform);
      expect(sellResult.fees.creator).toBe(expectedCreator);
    });

    it('applies sell tax as flywheel', () => {
      const buyResult = simulator.simulateBuy(initialReserves(), 1_000_000n);
      const sellTaxBps = 300n; // 3%
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut, sellTaxBps);

      expect(sellResult.fees.flywheel).toBeGreaterThan(0n);
      // flywheel = grossBtcOut * sellTaxBps / FEE_DENOMINATOR
      const grossBtcOut = sellResult.btcOut + sellResult.fees.total;
      const expectedFlywheel = (grossBtcOut * sellTaxBps) / FEE_DENOMINATOR;
      expect(sellResult.fees.flywheel).toBe(expectedFlywheel);
    });

    it('price impact is positive for sells (measured as price drop)', () => {
      // Large buy first to move price enough for integer-visible impact
      const buyResult = simulator.simulateBuy(largeCapReserves(), 500_000_000n);
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      expect(sellResult.priceImpactBps).toBeGreaterThan(0);
    });

    it('sell restores reserves towards initial state', () => {
      const buyResult = simulator.simulateBuy(initialReserves(), 1_000_000n);
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      // After buy+sell, virtualBtcReserve should be close to initial (but not exact due to fees)
      expect(sellResult.newReserves.virtualBtcReserve).toBeLessThan(buyResult.newReserves.virtualBtcReserve);
      expect(sellResult.newReserves.virtualTokenSupply).toBeGreaterThan(buyResult.newReserves.virtualTokenSupply);
    });

    it('new price is lower after sell (large amounts)', () => {
      // Large buy to move price up visibly, then sell it back
      const buyResult = simulator.simulateBuy(largeCapReserves(), 500_000_000n);
      const priceBefore = simulator.calculatePrice(
        buyResult.newReserves.virtualBtcReserve,
        buyResult.newReserves.virtualTokenSupply,
      );
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      expect(sellResult.newPriceSats).toBeLessThan(priceBefore);
    });
  });

  describe('edge cases', () => {
    it('handles maximum allowed buy tax (3%)', () => {
      const result = simulator.simulateBuy(initialReserves(), 1_000_000n, 300n);

      // Total fee = 1.5% base + 3% flywheel = 4.5%
      const expected = (1_000_000n * TOTAL_FEE_BPS) / FEE_DENOMINATOR + (1_000_000n * 300n) / FEE_DENOMINATOR;
      expect(result.fees.total).toBe(expected);
    });

    it('handles maximum allowed sell tax (5%)', () => {
      const buyResult = simulator.simulateBuy(largeCapReserves(), 10_000_000n);
      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut, 500n);

      expect(sellResult.fees.flywheel).toBeGreaterThan(0n);
      expect(sellResult.btcOut).toBeGreaterThan(0n);
    });

    it('very large buy does not overflow', () => {
      // 10 BTC buy
      const result = simulator.simulateBuy(largeCapReserves(), 1_000_000_000n);

      expect(result.tokensOut).toBeGreaterThan(0n);
      expect(result.newReserves.virtualBtcReserve).toBeGreaterThan(INITIAL_VIRTUAL_BTC_SATS);
    });

    it('kConstant is preserved across operations', () => {
      const reserves = initialReserves();

      expect(reserves.kConstant).toBe(K_CONSTANT);

      const buy = simulator.simulateBuy(reserves, 1_000_000n);
      expect(buy.newReserves.kConstant).toBe(K_CONSTANT);

      const sell = simulator.simulateSell(buy.newReserves, buy.tokensOut / 2n);
      expect(sell.newReserves.kConstant).toBe(K_CONSTANT);
    });
  });
});

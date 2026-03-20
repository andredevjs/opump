import { describe, it, expect } from 'vitest';
import { BondingCurveSimulator } from '../../functions/_shared/bonding-curve.mts';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  MIN_TRADE_SATS,
  GRADUATION_THRESHOLD_SATS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  PRICE_PRECISION,
} from '../../functions/_shared/constants.mts';

const sim = new BondingCurveSimulator();

describe('BondingCurveSimulator', () => {
  // ---------------------------------------------------------------
  // 1. getInitialReserves matches constants
  // ---------------------------------------------------------------
  describe('getInitialReserves', () => {
    it('returns reserves matching the module constants', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();

      expect(reserves.virtualBtcReserve).toBe(INITIAL_VIRTUAL_BTC_SATS);
      expect(reserves.virtualTokenSupply).toBe(INITIAL_VIRTUAL_TOKEN_SUPPLY);
      expect(reserves.kConstant).toBe(K_CONSTANT);
      expect(reserves.realBtcReserve).toBe(0n);
    });

    it('kConstant equals virtualBtcReserve * virtualTokenSupply', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();

      expect(reserves.kConstant).toBe(
        reserves.virtualBtcReserve * reserves.virtualTokenSupply,
      );
    });
  });

  // ---------------------------------------------------------------
  // 2. calculatePrice with initial reserves
  // ---------------------------------------------------------------
  describe('calculatePrice', () => {
    it('returns INITIAL_VIRTUAL_BTC_SATS * PRICE_PRECISION / INITIAL_VIRTUAL_TOKEN_SUPPLY for initial reserves', () => {
      const expected =
        (INITIAL_VIRTUAL_BTC_SATS * PRICE_PRECISION) / INITIAL_VIRTUAL_TOKEN_SUPPLY;

      const price = sim.calculatePrice(
        INITIAL_VIRTUAL_BTC_SATS,
        INITIAL_VIRTUAL_TOKEN_SUPPLY,
      );

      expect(price).toBe(expected);
      expect(price).toBe(7670000n);
    });

    it('returns 0 when virtualToken is 0', () => {
      expect(sim.calculatePrice(1000n, 0n)).toBe(0n);
    });
  });

  // ---------------------------------------------------------------
  // 3. simulateBuy — basic buy with 100 000 sats
  // ---------------------------------------------------------------
  describe('simulateBuy', () => {
    it('computes correct fees, tokens out, and new reserves for a 100_000 sat buy', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();
      const btcAmount = 100_000n;

      const result = sim.simulateBuy(reserves, btcAmount);

      // Fee breakdown (no flywheel)
      const expectedPlatform =
        (btcAmount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR; // 1000
      const expectedBaseFee =
        (btcAmount * TOTAL_FEE_BPS) / FEE_DENOMINATOR; // 1250
      const expectedCreator = expectedBaseFee - expectedPlatform; // 250
      const expectedTotal = expectedBaseFee; // 1250 (flywheel=0)

      expect(result.fees.platform).toBe(expectedPlatform);
      expect(result.fees.platform).toBe(1000n);
      expect(result.fees.creator).toBe(expectedCreator);
      expect(result.fees.creator).toBe(250n);
      expect(result.fees.flywheel).toBe(0n);
      expect(result.fees.total).toBe(expectedTotal);
      expect(result.fees.total).toBe(1250n);

      // Net BTC applied to curve
      const netBtc = btcAmount - expectedTotal; // 98750
      expect(netBtc).toBe(98750n);

      // New virtual reserves
      const expectedNewVBtc = INITIAL_VIRTUAL_BTC_SATS + netBtc; // 865750
      const expectedNewVToken = K_CONSTANT / expectedNewVBtc;
      const expectedTokensOut =
        INITIAL_VIRTUAL_TOKEN_SUPPLY - expectedNewVToken;

      expect(result.newReserves.virtualBtcReserve).toBe(expectedNewVBtc);
      expect(result.newReserves.virtualBtcReserve).toBe(865750n);
      expect(result.newReserves.virtualTokenSupply).toBe(expectedNewVToken);
      expect(result.newReserves.virtualTokenSupply).toBe(88593704880161709n);
      expect(result.tokensOut).toBe(expectedTokensOut);
      expect(result.tokensOut).toBe(11406295119838291n);

      // Real BTC reserve increases by netBtc
      expect(result.newReserves.realBtcReserve).toBe(netBtc);

      // k stays constant
      expect(result.newReserves.kConstant).toBe(K_CONSTANT);

      // Price impact is positive (price went up)
      expect(result.priceImpactBps).toBeGreaterThan(0);
      expect(result.priceImpactBps).toBe(2740);

      // New price after buy is higher than initial price
      const initialPrice = sim.calculatePrice(
        INITIAL_VIRTUAL_BTC_SATS,
        INITIAL_VIRTUAL_TOKEN_SUPPLY,
      );
      expect(result.newPriceSats).toBeGreaterThan(initialPrice);

      // Effective price
      const expectedEffective =
        (btcAmount * PRICE_PRECISION) / result.tokensOut;
      expect(result.effectivePriceSats).toBe(expectedEffective);
    });

    // ---------------------------------------------------------------
    // 4. simulateBuy below MIN_TRADE_SATS
    // ---------------------------------------------------------------
    it('throws when btcAmount is below MIN_TRADE_SATS', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();

      expect(() => sim.simulateBuy(reserves, 9999n)).toThrow(
        'Below minimum trade amount',
      );

      expect(() => sim.simulateBuy(reserves, 0n)).toThrow(
        'Below minimum trade amount',
      );
    });

    // ---------------------------------------------------------------
    // 5. simulateBuy exceeding graduation threshold
    // ---------------------------------------------------------------
    it('throws when buy would exceed graduation threshold', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();

      // 7_000_000 sats → netBtc = 6_912_500 > GRADUATION_THRESHOLD_SATS (6_900_000)
      expect(() => sim.simulateBuy(reserves, 7_000_000n)).toThrow(
        'Exceeds graduation threshold',
      );
    });

    it('succeeds right at the graduation threshold', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();

      // Find the largest buy that doesn't exceed the threshold:
      // realBtcReserve(0) + netBtc <= 6_900_000
      // btcAmount - btcAmount*125/10000 <= 6_900_000
      // btcAmount * 9875/10000 <= 6_900_000
      // btcAmount <= 6_900_000 * 10000/9875 = 6_987_341.77…
      // So 6_987_341 should work (netBtc = 6987341 - 87341 = 6900000)
      const maxBuy = 6_987_341n;
      const netBtc = maxBuy - (maxBuy * TOTAL_FEE_BPS) / FEE_DENOMINATOR;

      expect(netBtc).toBeLessThanOrEqual(GRADUATION_THRESHOLD_SATS);
      expect(() => sim.simulateBuy(reserves, maxBuy)).not.toThrow();
    });
  });

  // ---------------------------------------------------------------
  // 6. simulateSell — basic sell with post-buy reserves
  // ---------------------------------------------------------------
  describe('simulateSell', () => {
    it('returns positive btcOut and correct fees when selling tokens', () => {
      // First do a buy to get reserves with realBtcReserve > 0
      const initial = BondingCurveSimulator.getInitialReserves();
      const buyResult = sim.simulateBuy(initial, 100_000n);
      const postBuyReserves = buyResult.newReserves;
      const tokensToSell = buyResult.tokensOut;

      const result = sim.simulateSell(postBuyReserves, tokensToSell);

      // Selling all tokens should yield grossBtcOut = 98750 (the netBtc from buy)
      const expectedGrossBtcOut = 98750n;
      const expectedBaseFee =
        (expectedGrossBtcOut * TOTAL_FEE_BPS) / FEE_DENOMINATOR; // 1234
      const expectedPlatform =
        (expectedGrossBtcOut * PLATFORM_FEE_BPS) / FEE_DENOMINATOR; // 987
      const expectedCreator = expectedBaseFee - expectedPlatform; // 247
      const expectedBtcOut = expectedGrossBtcOut - expectedBaseFee; // 97516

      expect(result.btcOut).toBe(expectedBtcOut);
      expect(result.btcOut).toBe(97516n);
      expect(result.fees.platform).toBe(expectedPlatform);
      expect(result.fees.platform).toBe(987n);
      expect(result.fees.creator).toBe(expectedCreator);
      expect(result.fees.creator).toBe(247n);
      expect(result.fees.flywheel).toBe(0n);
      expect(result.fees.total).toBe(expectedBaseFee);
      expect(result.fees.total).toBe(1234n);

      // After selling all tokens back, reserves return to initial virtual values
      expect(result.newReserves.virtualBtcReserve).toBe(
        INITIAL_VIRTUAL_BTC_SATS,
      );
      expect(result.newReserves.virtualTokenSupply).toBe(
        INITIAL_VIRTUAL_TOKEN_SUPPLY,
      );
      expect(result.newReserves.realBtcReserve).toBe(0n);
      expect(result.newReserves.kConstant).toBe(K_CONSTANT);

      // Price impact is positive (price dropped)
      expect(result.priceImpactBps).toBeGreaterThan(0);

      // btcOut is strictly positive
      expect(result.btcOut).toBeGreaterThan(0n);
    });

    // ---------------------------------------------------------------
    // 7. simulateSell exceeding real BTC reserve
    // ---------------------------------------------------------------
    it('throws when grossBtcOut exceeds realBtcReserve', () => {
      const initial = BondingCurveSimulator.getInitialReserves();
      const buyResult = sim.simulateBuy(initial, 100_000n);
      const postBuyReserves = buyResult.newReserves;

      // Selling 2x the tokens received would require more BTC than is in the real reserve
      const excessiveTokens = buyResult.tokensOut * 2n;

      expect(() => sim.simulateSell(postBuyReserves, excessiveTokens)).toThrow(
        'Insufficient real BTC reserve',
      );
    });

    // ---------------------------------------------------------------
    // 8. simulateSell tiny amount → below minimum
    // ---------------------------------------------------------------
    it('throws when selling a tiny token amount that yields below MIN_TRADE_SATS', () => {
      const initial = BondingCurveSimulator.getInitialReserves();
      const buyResult = sim.simulateBuy(initial, 100_000n);
      const postBuyReserves = buyResult.newReserves;

      // Selling 1 token from post-buy reserves yields grossBtcOut of ~1 sat
      expect(() => sim.simulateSell(postBuyReserves, 1n)).toThrow(
        'Below minimum trade amount',
      );
    });
  });

  // ---------------------------------------------------------------
  // 9. Fee calculation with flywheel tax
  // ---------------------------------------------------------------
  describe('fee calculation with flywheel tax', () => {
    it('includes flywheel fee when buyTaxBps is provided', () => {
      const reserves = BondingCurveSimulator.getInitialReserves();
      const btcAmount = 100_000n;
      const buyTaxBps = 100n;

      const result = sim.simulateBuy(reserves, btcAmount, buyTaxBps);

      // Base fees remain the same
      const expectedPlatform =
        (btcAmount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR; // 1000
      const expectedBaseFee =
        (btcAmount * TOTAL_FEE_BPS) / FEE_DENOMINATOR; // 1250
      const expectedCreator = expectedBaseFee - expectedPlatform; // 250

      // Flywheel = amount * buyTaxBps / FEE_DENOMINATOR
      const expectedFlywheel =
        (btcAmount * buyTaxBps) / FEE_DENOMINATOR; // 1000
      const expectedTotal = expectedBaseFee + expectedFlywheel; // 2250

      expect(result.fees.platform).toBe(expectedPlatform);
      expect(result.fees.platform).toBe(1000n);
      expect(result.fees.creator).toBe(expectedCreator);
      expect(result.fees.creator).toBe(250n);
      expect(result.fees.flywheel).toBe(expectedFlywheel);
      expect(result.fees.flywheel).toBe(1000n);
      expect(result.fees.total).toBe(expectedTotal);
      expect(result.fees.total).toBe(2250n);

      // Net BTC is lower due to flywheel fee
      const netBtc = btcAmount - expectedTotal; // 97750
      expect(result.newReserves.virtualBtcReserve).toBe(
        INITIAL_VIRTUAL_BTC_SATS + netBtc,
      );
      expect(result.newReserves.realBtcReserve).toBe(netBtc);

      // Fewer tokens out than a buy without flywheel (more fees = less net BTC)
      const noFlywheelResult = sim.simulateBuy(reserves, btcAmount);
      expect(result.tokensOut).toBeLessThan(noFlywheelResult.tokensOut);
    });

    it('includes flywheel fee on sell when sellTaxBps is provided', () => {
      const initial = BondingCurveSimulator.getInitialReserves();
      const buyResult = sim.simulateBuy(initial, 100_000n);
      const postBuyReserves = buyResult.newReserves;
      const tokensToSell = buyResult.tokensOut;
      const sellTaxBps = 100n;

      const result = sim.simulateSell(
        postBuyReserves,
        tokensToSell,
        sellTaxBps,
      );

      // grossBtcOut = 98750 (same as netBtc from original buy)
      const grossBtcOut = 98750n;
      const expectedFlywheel =
        (grossBtcOut * sellTaxBps) / FEE_DENOMINATOR; // 987
      const expectedBaseFee =
        (grossBtcOut * TOTAL_FEE_BPS) / FEE_DENOMINATOR; // 1234
      const expectedTotal = expectedBaseFee + expectedFlywheel; // 2221

      expect(result.fees.flywheel).toBe(expectedFlywheel);
      expect(result.fees.flywheel).toBe(987n);
      expect(result.fees.total).toBe(expectedTotal);
      expect(result.fees.total).toBe(2221n);

      // btcOut is lower with flywheel
      const noFlywheelResult = sim.simulateSell(
        postBuyReserves,
        tokensToSell,
      );
      expect(result.btcOut).toBeLessThan(noFlywheelResult.btcOut);
    });
  });

  // ---------------------------------------------------------------
  // 10. Roundtrip: buy 500_000 then sell all tokens
  // ---------------------------------------------------------------
  describe('roundtrip buy then sell', () => {
    it('reserves return to initial virtual values after buying and selling the same tokens', () => {
      const initial = BondingCurveSimulator.getInitialReserves();
      const buyAmount = 500_000n;

      // Buy
      const buyResult = sim.simulateBuy(initial, buyAmount);

      expect(buyResult.newReserves.virtualBtcReserve).toBeGreaterThan(
        INITIAL_VIRTUAL_BTC_SATS,
      );
      expect(buyResult.newReserves.virtualTokenSupply).toBeLessThan(
        INITIAL_VIRTUAL_TOKEN_SUPPLY,
      );
      expect(buyResult.newReserves.realBtcReserve).toBeGreaterThan(0n);

      // Sell all tokens received
      const sellResult = sim.simulateSell(
        buyResult.newReserves,
        buyResult.tokensOut,
      );

      // Virtual reserves revert to initial values (integer division is exact in this case)
      expect(sellResult.newReserves.virtualBtcReserve).toBe(
        INITIAL_VIRTUAL_BTC_SATS,
      );
      expect(sellResult.newReserves.virtualTokenSupply).toBe(
        INITIAL_VIRTUAL_TOKEN_SUPPLY,
      );

      // Real BTC reserve returns to zero
      expect(sellResult.newReserves.realBtcReserve).toBe(0n);

      // kConstant is unchanged throughout
      expect(sellResult.newReserves.kConstant).toBe(K_CONSTANT);

      // The user receives less BTC than they spent due to fees on both sides
      const buyNetBtc =
        buyAmount - (buyAmount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
      expect(sellResult.btcOut).toBeLessThan(buyNetBtc);
      expect(sellResult.btcOut).toBeLessThan(buyAmount);

      // btcOut is still positive — user gets something back
      expect(sellResult.btcOut).toBeGreaterThan(0n);
    });

    it('price returns to the initial price after a full roundtrip', () => {
      const initial = BondingCurveSimulator.getInitialReserves();
      const initialPrice = sim.calculatePrice(
        initial.virtualBtcReserve,
        initial.virtualTokenSupply,
      );

      const buyResult = sim.simulateBuy(initial, 500_000n);

      // Price after buy is higher
      expect(buyResult.newPriceSats).toBeGreaterThan(initialPrice);

      const sellResult = sim.simulateSell(
        buyResult.newReserves,
        buyResult.tokensOut,
      );

      // Price after selling everything back equals initial price
      expect(sellResult.newPriceSats).toBe(initialPrice);
    });
  });
});

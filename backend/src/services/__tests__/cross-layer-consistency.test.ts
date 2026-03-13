/**
 * Cross-layer consistency tests.
 *
 * Verifies that the backend BondingCurveSimulator (bigint) produces results
 * consistent with the frontend bonding-curve.ts (BigNumber).
 *
 * This is critical because both layers MUST produce identical trade calculations.
 */
import { describe, it, expect } from 'vitest';
import { BondingCurveSimulator } from '../BondingCurveSimulator.js';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
} from '../../../../shared/constants/bonding-curve.js';

const simulator = new BondingCurveSimulator();

/**
 * Replicate the frontend BigNumber calculation in bigint for comparison.
 * Frontend: fee = floor(input * 1.5 / 100)
 * Backend:  fee = (input * 150) / 10000
 */
function frontendFee(amount: bigint): bigint {
  // Frontend uses: input.times(1.5).div(100).integerValue()
  // Which is equivalent to: floor(input * 15 / 1000)
  return (amount * 15n) / 1000n;
}

function backendFee(amount: bigint): bigint {
  return (amount * TOTAL_FEE_BPS) / FEE_DENOMINATOR;
}

describe('cross-layer consistency', () => {
  describe('fee calculation parity', () => {
    const testAmounts = [
      10_000n,     // minimum
      100_000n,    // 100k sats
      1_000_000n,  // 1M sats
      10_000_000n, // 10M sats
      100_000_000n, // 1 BTC
      1_000_000_000n, // 10 BTC
    ];

    for (const amount of testAmounts) {
      it(`fee matches for ${amount} sats`, () => {
        const fe = frontendFee(amount);
        const be = backendFee(amount);

        expect(fe).toBe(be);
      });
    }
  });

  describe('buy calculation parity', () => {
    it('produces matching tokens out for 1M sats buy', () => {
      const btcAmount = 1_000_000n;

      // Backend calculation
      const backendResult = simulator.simulateBuy(
        BondingCurveSimulator.getInitialReserves(),
        btcAmount,
      );

      // Frontend calculation (replicated in bigint)
      const fee = (btcAmount * 15n) / 1000n;
      const netBtc = btcAmount - fee;
      const newVBtc = INITIAL_VIRTUAL_BTC_SATS + netBtc;
      const newVToken = K_CONSTANT / newVBtc;
      const tokensOut = INITIAL_VIRTUAL_TOKEN_SUPPLY - newVToken;

      expect(backendResult.tokensOut).toBe(tokensOut);
      expect(backendResult.newReserves.virtualBtcReserve).toBe(newVBtc);
      expect(backendResult.newReserves.virtualTokenSupply).toBe(newVToken);
    });
  });

  describe('sell calculation parity', () => {
    it('produces matching BTC out for sell after 1M sats buy', () => {
      const btcAmount = 1_000_000n;
      const buyResult = simulator.simulateBuy(
        BondingCurveSimulator.getInitialReserves(),
        btcAmount,
      );

      const sellResult = simulator.simulateSell(buyResult.newReserves, buyResult.tokensOut);

      // Replicate frontend sell calculation
      const vBtc = buyResult.newReserves.virtualBtcReserve;
      const vToken = buyResult.newReserves.virtualTokenSupply;
      const tokensIn = buyResult.tokensOut;

      const newVToken = vToken + tokensIn;
      const newVBtc = K_CONSTANT / newVToken;
      const grossBtcOut = vBtc - newVBtc;
      const fee = (grossBtcOut * 15n) / 1000n;
      const btcOut = grossBtcOut - fee;

      expect(sellResult.btcOut).toBe(btcOut);
    });
  });

  describe('price calculation parity', () => {
    it('initial price matches between layers', () => {
      // Backend simulator uses PRICE_PRECISION (10^18) internally
      const backendScaled = simulator.calculatePrice(INITIAL_VIRTUAL_BTC_SATS, INITIAL_VIRTUAL_TOKEN_SUPPLY);

      // Backend normalizes to display: sats per whole token
      const backendDisplay = Number(backendScaled) / PRICE_DISPLAY_DIVISOR;

      // Frontend uses TOKEN_UNITS_PER_TOKEN (10^8) directly via BigNumber (no truncation)
      // Frontend price = virtualBtc * 10^8 / virtualToken (BigNumber handles decimals)
      const TOKEN_UNITS = 10n ** 8n;
      const frontendPrice = Number(INITIAL_VIRTUAL_BTC_SATS * TOKEN_UNITS) / Number(INITIAL_VIRTUAL_TOKEN_SUPPLY);

      expect(backendDisplay).toBeCloseTo(frontendPrice, 10);
    });
  });

  describe('constant parity', () => {
    it('initial K is consistent', () => {
      expect(K_CONSTANT).toBe(INITIAL_VIRTUAL_BTC_SATS * INITIAL_VIRTUAL_TOKEN_SUPPLY);
    });
  });
});

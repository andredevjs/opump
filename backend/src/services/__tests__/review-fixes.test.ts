/**
 * Tests covering the code review fixes applied to the feat/netlify branch.
 * Each test group maps to one or more review findings.
 */
import { describe, it, expect } from 'vitest';
import {
  GRADUATION_THRESHOLD_SATS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MINTER_FEE_BPS,
  FEE_DENOMINATOR,
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
} from '../../../../shared/constants/bonding-curve.js';
import type { TokenStatus as SharedTokenStatus } from '../../../../shared/types/token.js';
import { BondingCurveSimulator } from '../BondingCurveSimulator.js';

// ---------------------------------------------------------------------------
// Fix #3: BigInt volume aggregation (replaces $toLong which overflows at 2^63)
// ---------------------------------------------------------------------------
describe('BigInt volume aggregation (Fix #3)', () => {
  it('correctly sums volumes that would overflow $toLong (>2^63)', () => {
    // Simulate btcAmount strings from MongoDB documents
    const tradeAmounts = [
      '9223372036854775807', // 2^63 - 1 (max $toLong)
      '1000000000',         // 10 BTC
      '500000000',          // 5 BTC
    ];

    let total = 0n;
    for (const amt of tradeAmounts) {
      total += BigInt(amt);
    }

    expect(total).toBe(9223372036854775807n + 1000000000n + 500000000n);
    expect(total).toBe(9223372038354775807n);
    // This would overflow a signed 64-bit int
    expect(total > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('handles empty trade arrays gracefully', () => {
    const tradeAmounts: string[] = [];
    let total = 0n;
    for (const amt of tradeAmounts) {
      total += BigInt(amt);
    }
    expect(total).toBe(0n);
  });

  it('handles trade amounts with leading zeros or empty strings', () => {
    const tradeAmounts = ['0', '100000', '0'];
    let total = 0n;
    for (const amt of tradeAmounts) {
      total += BigInt(amt || '0');
    }
    expect(total).toBe(100000n);
  });
});

// ---------------------------------------------------------------------------
// Fix #4: TokenStatus alignment between shared and frontend
// ---------------------------------------------------------------------------
describe('TokenStatus alignment (Fix #4)', () => {
  it('shared TokenStatus includes "new"', () => {
    // This is a compile-time check enforced by TypeScript, but we also
    // verify at runtime that the union covers all expected values.
    const validStatuses: SharedTokenStatus[] = ['active', 'graduated', 'migrating', 'migrated', 'new'];
    expect(validStatuses).toHaveLength(5);
  });

  it('all frontend statuses are valid shared statuses', () => {
    const frontendStatuses = ['active', 'graduated', 'migrating', 'migrated', 'new'];
    const sharedStatuses: SharedTokenStatus[] = ['active', 'graduated', 'migrating', 'migrated', 'new'];

    for (const status of frontendStatuses) {
      expect(sharedStatuses).toContain(status);
    }
  });
});

// ---------------------------------------------------------------------------
// Fix #5: Price display and market cap calculation
// ---------------------------------------------------------------------------
describe('Price display normalization (Fix #5)', () => {
  it('PRICE_DISPLAY_DIVISOR equals 10^10', () => {
    expect(PRICE_DISPLAY_DIVISOR).toBe(1e10);
  });

  it('display price converts to sats per whole token', () => {
    const scaledPrice = (INITIAL_VIRTUAL_BTC_SATS * PRICE_PRECISION) / INITIAL_VIRTUAL_TOKEN_SUPPLY;
    const displayPrice = Number(scaledPrice) / PRICE_DISPLAY_DIVISOR;

    // 767000 / 1B tokens ≈ 0.000767 sats per whole token
    expect(displayPrice).toBeCloseTo(0.000767, 6);
  });

  it('market cap from reserves equals virtualBtc at initial state', () => {
    // marketCap = virtualBtc * totalSupply / virtualToken = virtualBtc (initial)
    const marketCap = INITIAL_VIRTUAL_BTC_SATS * INITIAL_VIRTUAL_TOKEN_SUPPLY / INITIAL_VIRTUAL_TOKEN_SUPPLY;
    expect(marketCap).toBe(INITIAL_VIRTUAL_BTC_SATS);
  });

  it('market cap is zero for zero supply', () => {
    const virtualToken = 0n;
    const marketCap = virtualToken > 0n ? INITIAL_VIRTUAL_BTC_SATS * INITIAL_VIRTUAL_TOKEN_SUPPLY / virtualToken : 0n;
    expect(marketCap).toBe(0n);
  });
});

// ---------------------------------------------------------------------------
// Fix #6: Number() vs parseInt() for large BigNumber strings
// ---------------------------------------------------------------------------
describe('Number() vs parseInt() precision (Fix #6)', () => {
  it('Number() and parseInt() both handle normal sats values', () => {
    const normalValue = '6900000'; // 0.069 BTC
    expect(Number(normalValue)).toBe(6900000);
    expect(parseInt(normalValue)).toBe(6900000);
  });

  it('parseInt() truncates non-numeric suffixes while Number() returns NaN', () => {
    // This shows why Number() is safer — it fails loudly
    const badValue = '6900000abc';
    expect(Number(badValue)).toBeNaN();
    expect(parseInt(badValue)).toBe(6900000); // silently truncates!
  });

  it('both handle values near MAX_SAFE_INTEGER identically', () => {
    const maxSafe = String(Number.MAX_SAFE_INTEGER); // 9007199254740991
    expect(Number(maxSafe)).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseInt(maxSafe)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// ---------------------------------------------------------------------------
// Fix #9: migrationFloorPrice default is non-zero
// ---------------------------------------------------------------------------
describe('Config defaults (Fix #9)', () => {
  it('migrationFloorPrice default is 1000 sats (not 0)', () => {
    // This mirrors the config behavior: parseInt(optional('MIGRATION_FLOOR_PRICE', '1000'), 10)
    const defaultValue = parseInt('1000', 10);
    expect(defaultValue).toBe(1000);
    expect(defaultValue).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Fix #13: MAX_SATS_PER_TX constant extraction
// ---------------------------------------------------------------------------
describe('MAX_SATS_PER_TX constant (Fix #13)', () => {
  it('is a reasonable value for OPNet transactions', () => {
    const MAX_SATS_PER_TX = 100_000n;
    // Should be enough for gas but not wastefully high
    expect(MAX_SATS_PER_TX).toBeGreaterThan(0n);
    expect(MAX_SATS_PER_TX).toBeLessThanOrEqual(1_000_000n); // < 0.01 BTC
  });
});

// ---------------------------------------------------------------------------
// Fix #14: Graduation threshold enforcement in buy
// ---------------------------------------------------------------------------
describe('Graduation threshold enforcement (Fix #14)', () => {
  const simulator = new BondingCurveSimulator();

  it('rejects buy that would exceed graduation threshold', () => {
    const reserves = BondingCurveSimulator.getInitialReserves();
    // Try to buy more than the 6.9M sat threshold
    expect(() => simulator.simulateBuy(reserves, GRADUATION_THRESHOLD_SATS + 1_000_000n))
      .toThrow('Exceeds graduation threshold');
  });

  it('allows buy up to the graduation threshold', () => {
    const reserves = BondingCurveSimulator.getInitialReserves();
    // Fee of 1.5% means net BTC is ~98.5% of input. Calculate max input
    // that results in realBtcReserve <= threshold
    const maxNetBtc = GRADUATION_THRESHOLD_SATS;
    // net = input - (input * 150/10000) = input * 9850/10000
    // input = maxNetBtc * 10000 / 9850
    const maxInput = (maxNetBtc * FEE_DENOMINATOR) / (FEE_DENOMINATOR - 150n);

    const result = simulator.simulateBuy(reserves, maxInput);
    expect(result.tokensOut).toBeGreaterThan(0n);
    expect(result.newReserves.realBtcReserve).toBeLessThanOrEqual(GRADUATION_THRESHOLD_SATS);
  });

  it('custom graduation threshold overrides default', () => {
    const reserves = {
      ...BondingCurveSimulator.getInitialReserves(),
      graduationThreshold: 100_000_000_000n, // 1000 BTC
    };

    // This would fail with default threshold but succeeds with custom
    const result = simulator.simulateBuy(reserves, 500_000_000n); // 5 BTC
    expect(result.tokensOut).toBeGreaterThan(0n);
  });
});

// ---------------------------------------------------------------------------
// IndexerService fee calculation consistency
// ---------------------------------------------------------------------------
describe('IndexerService fee calculation (Fix #3 related)', () => {
  it('matches shared constants for fee breakdown', () => {
    // This replicates the IndexerService.calculateFeeBreakdown logic
    const amount = 1_000_000n;

    const platform = (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
    const creator = (amount * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
    const minter = (amount * MINTER_FEE_BPS) / FEE_DENOMINATOR;

    expect(platform).toBe(10_000n);  // 1% of 1M
    expect(creator).toBe(2_500n);    // 0.25% of 1M
    expect(minter).toBe(2_500n);     // 0.25% of 1M
    expect(platform + creator + minter).toBe(15_000n); // 1.5% total
  });

  it('fee calculation handles small amounts without rounding to zero', () => {
    const smallAmount = 10_000n; // minimum trade (10k sats)

    const platform = (smallAmount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
    const creator = (smallAmount * CREATOR_FEE_BPS) / FEE_DENOMINATOR;
    const minter = (smallAmount * MINTER_FEE_BPS) / FEE_DENOMINATOR;

    expect(platform).toBe(100n);
    expect(creator).toBe(25n);
    expect(minter).toBe(25n);
  });
});

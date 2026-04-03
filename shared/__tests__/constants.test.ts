import { describe, it, expect } from 'vitest';
import {
  GRADUATION_THRESHOLD_SATS,
  MIN_TRADE_SATS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  MAX_CREATOR_ALLOCATION_BPS,
  MAX_AIRDROP_BPS,
  MAX_COMBINED_ALLOCATION_BPS,
  RESERVATION_TTL_BLOCKS,
  DEFAULT_MAX_SUPPLY,
  TOKEN_DECIMALS,
  TOKEN_UNITS_PER_TOKEN,
  PRICE_PRECISION,
  LN_100_SCALED,
  GRAD_SUPPLY_FRACTION_BPS,
} from '../constants/bonding-curve.ts';

describe('shared constants', () => {
  describe('exponential curve parameters', () => {
    it('default max supply = 1B tokens * 10^8 decimals', () => {
      expect(DEFAULT_MAX_SUPPLY).toBe(100_000_000_000_000_000n);
    });

    it('price precision = 10^18', () => {
      expect(PRICE_PRECISION).toBe(10n ** 18n);
    });

    it('token units per token = 10^8', () => {
      expect(TOKEN_UNITS_PER_TOKEN).toBe(10n ** 8n);
    });

    it('ln(100) scaled matches expected value', () => {
      // ln(100) ≈ 4.60517... * 10^18
      expect(LN_100_SCALED).toBe(4_605_170_185_988_091_368n);
    });

    it('graduation at 80% of curve supply', () => {
      expect(GRAD_SUPPLY_FRACTION_BPS).toBe(8_000n);
    });
  });

  describe('fee schedule', () => {
    it('total fee = platform + creator', () => {
      expect(TOTAL_FEE_BPS).toBe(PLATFORM_FEE_BPS + CREATOR_FEE_BPS);
    });

    it('platform fee = 1% (100 bps)', () => {
      expect(PLATFORM_FEE_BPS).toBe(100n);
    });

    it('creator fee = 0.25% (25 bps)', () => {
      expect(CREATOR_FEE_BPS).toBe(25n);
    });

    it('total fee = 1.25% (125 bps)', () => {
      expect(TOTAL_FEE_BPS).toBe(125n);
    });

    it('fee denominator = 10000 (basis points)', () => {
      expect(FEE_DENOMINATOR).toBe(10_000n);
    });
  });

  describe('graduation', () => {
    it('graduation threshold = 69M sats (0.69 BTC)', () => {
      expect(GRADUATION_THRESHOLD_SATS).toBe(69_000_000n);
    });
  });

  describe('trade limits', () => {
    it('minimum trade = 10,000 sats', () => {
      expect(MIN_TRADE_SATS).toBe(10_000n);
    });
  });

  describe('allocation caps', () => {
    it('max creator allocation = 70% (7000 bps)', () => {
      expect(MAX_CREATOR_ALLOCATION_BPS).toBe(7_000n);
    });

    it('max airdrop = 70% (7000 bps)', () => {
      expect(MAX_AIRDROP_BPS).toBe(7_000n);
    });

    it('max combined allocation = 70% (7000 bps)', () => {
      expect(MAX_COMBINED_ALLOCATION_BPS).toBe(7_000n);
    });
  });

  describe('reservation', () => {
    it('reservation TTL = 3 blocks', () => {
      expect(RESERVATION_TTL_BLOCKS).toBe(3n);
    });
  });

  describe('token config', () => {
    it('token decimals = 8', () => {
      expect(TOKEN_DECIMALS).toBe(8);
    });
  });
});

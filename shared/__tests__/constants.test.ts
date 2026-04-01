import { describe, it, expect } from 'vitest';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
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
} from '../../shared/constants/bonding-curve.js';

describe('shared constants', () => {
  describe('bonding curve reserves', () => {
    it('initial virtual BTC = 0.00767 BTC in sats', () => {
      expect(INITIAL_VIRTUAL_BTC_SATS).toBe(767_000n);
    });

    it('initial virtual token supply = 1B tokens * 10^8 decimals', () => {
      expect(INITIAL_VIRTUAL_TOKEN_SUPPLY).toBe(100_000_000_000_000_000n);
    });

    it('K = virtualBtc * virtualTokenSupply', () => {
      expect(K_CONSTANT).toBe(INITIAL_VIRTUAL_BTC_SATS * INITIAL_VIRTUAL_TOKEN_SUPPLY);
    });

    it('default max supply matches initial virtual token supply', () => {
      expect(DEFAULT_MAX_SUPPLY).toBe(INITIAL_VIRTUAL_TOKEN_SUPPLY);
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

    it('1% fee calculation is correct', () => {
      const amount = 1_000_000n;
      const fee = (amount * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
      expect(fee).toBe(10_000n); // 1% of 1M = 10k
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
    it('max creator allocation = 10% (1000 bps)', () => {
      expect(MAX_CREATOR_ALLOCATION_BPS).toBe(1_000n);
    });

    it('max airdrop = 20% (2000 bps)', () => {
      expect(MAX_AIRDROP_BPS).toBe(2_000n);
    });

    it('max combined allocation = 25% (2500 bps)', () => {
      expect(MAX_COMBINED_ALLOCATION_BPS).toBe(2_500n);
    });

    it('max creator + max airdrop exceeds combined cap (requiring validation)', () => {
      // 10% + 20% = 30% > 25% cap — system must validate this
      expect(MAX_CREATOR_ALLOCATION_BPS + MAX_AIRDROP_BPS).toBeGreaterThan(MAX_COMBINED_ALLOCATION_BPS);
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

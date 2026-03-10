import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  satsToBtc,
  btcToSats,
  tokenUnitsToTokens,
  tokensToUnits,
  formatBtc,
  formatSats,
  formatTokenAmount,
  formatPrice,
  formatPercent,
  formatNumber,
  shortenAddress,
  timeAgo,
} from '../format';

describe('format', () => {
  describe('satsToBtc', () => {
    it('converts 100M sats to 1 BTC', () => {
      expect(satsToBtc(100_000_000)).toBe(1);
    });

    it('converts 0 sats to 0 BTC', () => {
      expect(satsToBtc(0)).toBe(0);
    });

    it('converts 50M sats to 0.5 BTC', () => {
      expect(satsToBtc(50_000_000)).toBe(0.5);
    });

    it('handles small amounts', () => {
      expect(satsToBtc(1)).toBe(0.00000001);
    });
  });

  describe('btcToSats', () => {
    it('converts 1 BTC to 100M sats', () => {
      expect(btcToSats(1)).toBe(100_000_000);
    });

    it('converts 0 BTC to 0 sats', () => {
      expect(btcToSats(0)).toBe(0);
    });

    it('rounds to nearest sat', () => {
      // 0.000000015 * 1e8 = 1.4999... due to floating point
      expect(btcToSats(0.000000015)).toBe(1);
      // Use a value that rounds clearly
      expect(btcToSats(0.000000016)).toBe(2);
    });
  });

  describe('tokenUnitsToTokens', () => {
    it('converts units to whole tokens', () => {
      expect(tokenUnitsToTokens(100_000_000)).toBe(1);
    });

    it('converts 0 units to 0 tokens', () => {
      expect(tokenUnitsToTokens(0)).toBe(0);
    });

    it('handles fractional tokens', () => {
      expect(tokenUnitsToTokens(50_000_000)).toBe(0.5);
    });
  });

  describe('tokensToUnits', () => {
    it('converts 1 token to 100M units', () => {
      expect(tokensToUnits(1)).toBe('100000000');
    });

    it('converts 0 tokens to 0 units', () => {
      expect(tokensToUnits(0)).toBe('0');
    });

    it('handles large numbers without precision loss', () => {
      const result = tokensToUnits(1_000_000_000); // 1B tokens
      expect(result).toBe('100000000000000000');
    });

    it('truncates fractional units', () => {
      const result = tokensToUnits(1.5);
      expect(result).toBe('150000000');
    });
  });

  describe('formatBtc', () => {
    it('formats >= 1 BTC with BTC suffix', () => {
      expect(formatBtc(100_000_000)).toBe('1.0000 BTC');
    });

    it('formats >= 1M sats with M suffix', () => {
      expect(formatBtc(2_500_000)).toBe('2.50M sats');
    });

    it('formats >= 1k sats with k suffix', () => {
      expect(formatBtc(50_000)).toBe('50.0k sats');
    });

    it('formats small amounts with sats', () => {
      expect(formatBtc(500)).toBe('500 sats');
    });

    it('accepts string input', () => {
      expect(formatBtc('100000000')).toBe('1.0000 BTC');
    });

    it('respects custom decimals', () => {
      expect(formatBtc(100_000_000, 2)).toBe('1.00 BTC');
    });

    it('formats 2.5 BTC', () => {
      expect(formatBtc(250_000_000)).toBe('2.5000 BTC');
    });
  });

  describe('formatSats', () => {
    it('formats billions', () => {
      expect(formatSats(3_000_000_000)).toBe('3.00B');
    });

    it('formats millions', () => {
      expect(formatSats(1_500_000)).toBe('1.50M');
    });

    it('formats thousands', () => {
      expect(formatSats(50_000)).toBe('50.0k');
    });

    it('formats small numbers with locale string', () => {
      const result = formatSats(999);
      // toLocaleString output varies by environment but should be the number
      expect(result).toBe('999');
    });
  });

  describe('formatTokenAmount', () => {
    it('formats billions of tokens', () => {
      // 1B tokens = 1B * 10^8 units
      expect(formatTokenAmount('100000000000000000')).toBe('1.00B');
    });

    it('formats millions of tokens', () => {
      // 5M tokens = 5M * 10^8 units = 500_000_000_000_000
      expect(formatTokenAmount('500000000000000')).toBe('5.00M');
    });

    it('formats thousands of tokens', () => {
      // 50k tokens = 50k * 10^8 units = 5_000_000_000_000
      expect(formatTokenAmount('5000000000000')).toBe('50.0k');
    });

    it('formats small amounts with 2 decimals', () => {
      // 1.25 tokens = 125_000_000 units
      expect(formatTokenAmount('125000000')).toBe('1.25');
    });

    it('handles numeric input', () => {
      expect(formatTokenAmount(100000000)).toBe('1.00');
    });
  });

  describe('formatPrice', () => {
    it('formats >= 1 BTC in BTC', () => {
      expect(formatPrice(100_000_000)).toBe('1.000000 BTC');
    });

    it('formats >= 1000 sats in k sats', () => {
      expect(formatPrice(5000)).toBe('5.00k sats');
    });

    it('formats >= 1 sat with 2 decimals', () => {
      expect(formatPrice(3)).toBe('3.00 sats');
    });

    it('formats sub-sat with 6 decimals', () => {
      expect(formatPrice(0.5)).toBe('0.500000 sats');
    });
  });

  describe('formatPercent', () => {
    it('adds + sign for positive', () => {
      expect(formatPercent(5.5)).toBe('+5.50%');
    });

    it('shows - sign for negative', () => {
      expect(formatPercent(-3.2)).toBe('-3.20%');
    });

    it('adds + sign for zero', () => {
      expect(formatPercent(0)).toBe('+0.00%');
    });
  });

  describe('formatNumber', () => {
    it('formats billions', () => {
      expect(formatNumber(2_500_000_000)).toBe('2.5B');
    });

    it('formats millions', () => {
      expect(formatNumber(1_200_000)).toBe('1.2M');
    });

    it('formats thousands', () => {
      expect(formatNumber(5_000)).toBe('5.0k');
    });

    it('formats small numbers', () => {
      const result = formatNumber(123);
      expect(result).toBe('123');
    });
  });

  describe('shortenAddress', () => {
    it('shortens long addresses', () => {
      const addr = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      expect(shortenAddress(addr)).toBe('bc1qxy...hx0wlh');
    });

    it('returns short addresses unchanged', () => {
      expect(shortenAddress('abc')).toBe('abc');
    });

    it('respects custom char count', () => {
      const addr = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
      expect(shortenAddress(addr, 4)).toBe('bc1q...0wlh');
    });
  });

  describe('timeAgo', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('shows seconds for recent timestamps', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000 * 30 + 1000); // 30 seconds after timestamp
      expect(timeAgo(1000)).toBe('30s ago');
    });

    it('shows minutes', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + 5 * 60 * 1000); // 5 minutes
      expect(timeAgo(1000)).toBe('5m ago');
    });

    it('shows hours', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + 3 * 60 * 60 * 1000); // 3 hours
      expect(timeAgo(1000)).toBe('3h ago');
    });

    it('shows days', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000 + 2 * 24 * 60 * 60 * 1000); // 2 days
      expect(timeAgo(1000)).toBe('2d ago');
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import {
  generateCode,
  createReferralCode,
  getReferralCode,
  getCodeInfo,
  linkWalletToReferrer,
  getReferrer,
  creditReferralEarnings,
  getReferralEarnings,
} from '../../functions/_shared/referral-queries.mts';

const VALID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('generateCode()', () => {
  it('returns a 6-character string', () => {
    const code = generateCode();
    expect(code).toHaveLength(6);
    expect(typeof code).toBe('string');
  });

  it('only uses characters from the allowed set (no 0, O, 1, I)', () => {
    // Run multiple times to increase confidence
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      for (const ch of code) {
        expect(VALID_CHARS).toContain(ch);
      }
    }
  });
});

describe('createReferralCode() + getReferralCode()', () => {
  beforeEach(() => resetMockRedis());

  it('stores and retrieves the code for a wallet', async () => {
    const wallet = 'bc1preferrer';
    const code = 'ABC123';
    await createReferralCode(wallet, code);

    const retrieved = await getReferralCode(wallet);
    expect(retrieved).toBe('ABC123');
  });
});

describe('createReferralCode() + getCodeInfo()', () => {
  beforeEach(() => resetMockRedis());

  it('stores and retrieves code info with wallet and createdAt', async () => {
    const wallet = 'bc1preferrer';
    const code = 'XYZ789';
    await createReferralCode(wallet, code);

    const info = await getCodeInfo(code);
    expect(info).not.toBeNull();
    expect(info!.wallet).toBe(wallet);
    expect(info!.createdAt).toBeDefined();
    // createdAt should be a valid ISO date string
    expect(new Date(info!.createdAt).toISOString()).toBe(info!.createdAt);
  });
});

describe('linkWalletToReferrer()', () => {
  beforeEach(() => resetMockRedis());

  it('returns true the first time a wallet is linked', async () => {
    const result = await linkWalletToReferrer('bc1preferred', 'bc1preferrer');
    expect(result).toBe(true);
  });

  it('returns false on second link attempt (first-touch immutability)', async () => {
    await linkWalletToReferrer('bc1preferred', 'bc1preferrer');
    const result = await linkWalletToReferrer('bc1preferred', 'bc1pother');
    expect(result).toBe(false);
  });
});

describe('getReferrer()', () => {
  beforeEach(() => resetMockRedis());

  it('returns the linked referrer wallet', async () => {
    await linkWalletToReferrer('bc1preferred', 'bc1preferrer');
    const referrer = await getReferrer('bc1preferred');
    expect(referrer).toBe('bc1preferrer');
  });

  it('returns null for an unlinked wallet', async () => {
    const referrer = await getReferrer('bc1punlinked');
    expect(referrer).toBeNull();
  });
});

describe('creditReferralEarnings()', () => {
  beforeEach(() => resetMockRedis());

  it('increments totalSats and tradeCount', async () => {
    await creditReferralEarnings('bc1preferrer', '5000');

    const earnings = await getReferralEarnings('bc1preferrer');
    expect(earnings.totalSats).toBe('5000');
    expect(earnings.tradeCount).toBe(1);
  });

  it('accumulates over multiple calls', async () => {
    await creditReferralEarnings('bc1preferrer', '5000');
    await creditReferralEarnings('bc1preferrer', '3000');

    const earnings = await getReferralEarnings('bc1preferrer');
    expect(earnings.totalSats).toBe('8000');
    expect(earnings.tradeCount).toBe(2);
  });
});

describe('getReferralEarnings()', () => {
  beforeEach(() => resetMockRedis());

  it('returns zeros for a wallet with no earnings', async () => {
    const earnings = await getReferralEarnings('bc1pnobody');
    expect(earnings.totalSats).toBe('0');
    expect(earnings.tradeCount).toBe(0);
    expect(earnings.referralCount).toBe(0);
  });
});

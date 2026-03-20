import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { createReferralCode } from '../../functions/_shared/referral-queries.mts';

function postLink(body: unknown): Request {
  return new Request('http://localhost/api/v1/referral/link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postBulk(body: unknown): Request {
  return new Request('http://localhost/api/v1/referral/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const REFERRER = 'bc1preferrer000000000000000000000000000000a';
const REFERRED = 'bc1preferred000000000000000000000000000000a';
const CODE = 'ABC123';

describe('referral endpoints', () => {
  beforeEach(async () => {
    resetMockRedis();
    await createReferralCode(REFERRER, CODE);
  });

  describe('POST /api/v1/referral/link', () => {
    it('links wallet to referrer with valid code', async () => {
      const handler = (await import('../../functions/referral-link.mts')).default;
      const res = await handler(postLink({ walletAddress: REFERRED, referralCode: CODE }), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.referrerAddress).toBe(REFERRER);
    });

    it('returns 404 for invalid code', async () => {
      const handler = (await import('../../functions/referral-link.mts')).default;
      const res = await handler(postLink({ walletAddress: REFERRED, referralCode: 'INVALID' }), {} as any);
      expect(res.status).toBe(404);
    });

    it('returns 400 for self-referral', async () => {
      const handler = (await import('../../functions/referral-link.mts')).default;
      const res = await handler(postLink({ walletAddress: REFERRER, referralCode: CODE }), {} as any);
      expect(res.status).toBe(400);
    });

    it('preserves first-touch on second link attempt', async () => {
      const handler = (await import('../../functions/referral-link.mts')).default;
      await handler(postLink({ walletAddress: REFERRED, referralCode: CODE }), {} as any);

      // Create another referrer's code
      await createReferralCode('bc1pother0000000000000000000000000000000000a', 'XYZ789');
      const res = await handler(postLink({ walletAddress: REFERRED, referralCode: 'XYZ789' }), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      // Still returns the original referrer
      expect(body.referrerAddress).toBe(REFERRER);
    });
  });

  describe('GET /api/v1/referral/:address', () => {
    it('returns referral info for wallet with code', async () => {
      const handler = (await import('../../functions/referral-info.mts')).default;
      const req = new Request(`http://localhost/api/v1/referral/${REFERRER}`);
      const res = await handler(req, { params: { address: REFERRER } } as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.code).toBe(CODE);
      expect(body.earnings).toBeDefined();
      expect(body.earnings.totalSats).toBe('0');
    });

    it('returns null code for wallet without referral', async () => {
      const handler = (await import('../../functions/referral-info.mts')).default;
      const req = new Request(`http://localhost/api/v1/referral/${REFERRED}`);
      const res = await handler(req, { params: { address: REFERRED } } as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.code).toBeNull();
    });
  });

  describe('POST /api/v1/referral/bulk', () => {
    it('creates codes for wallets with valid admin secret', async () => {
      const handler = (await import('../../functions/referral-bulk.mts')).default;
      const wallets = ['bc1pbulk10000000000000000000000000000000000a', 'bc1pbulk20000000000000000000000000000000000a'];
      const res = await handler(postBulk({ wallets, secret: 'test-admin-secret' }), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.created).toBe(2);
      expect(body.codes.length).toBe(2);
    });

    it('skips wallets that already have codes', async () => {
      const handler = (await import('../../functions/referral-bulk.mts')).default;
      const res = await handler(postBulk({ wallets: [REFERRER], secret: 'test-admin-secret' }), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.skipped).toBe(1);
      expect(body.created).toBe(0);
    });

    it('returns 401 for wrong admin secret', async () => {
      const handler = (await import('../../functions/referral-bulk.mts')).default;
      const res = await handler(postBulk({ wallets: ['wallet1'], secret: 'wrong' }), {} as any);
      expect(res.status).toBe(401);
    });
  });
});

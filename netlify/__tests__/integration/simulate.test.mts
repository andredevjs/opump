import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { saveToken } from '../../functions/_shared/redis-queries.mts';
import { makeToken, VALID_TOKEN_ADDRESS } from '../fixtures/index.js';

function postBuy(body: unknown): Request {
  return new Request('http://localhost/api/v1/simulate/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postSell(body: unknown): Request {
  return new Request('http://localhost/api/v1/simulate/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('simulate endpoints', () => {
  beforeEach(async () => {
    resetMockRedis();
    await saveToken(makeToken());
  });

  describe('POST /api/v1/simulate/buy', () => {
    it('returns simulation result for valid buy', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: VALID_TOKEN_ADDRESS, btcAmountSats: '100000' }), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.tokensOut).toBeDefined();
      expect(BigInt(body.tokensOut)).toBeGreaterThan(0n);
      expect(body.fees.platform).toBeDefined();
      expect(body.fees.creator).toBeDefined();
      expect(body.fees.total).toBeDefined();
      expect(body.priceImpactBps).toBeGreaterThan(0);
      expect(body.newPriceSats).toBeDefined();
      expect(body.effectivePriceSats).toBeDefined();
    });

    it('returns 404 for non-existent token', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: 'bc1pnonexistent0000000000000000000000000000a', btcAmountSats: '100000' }), {} as any);
      expect(res.status).toBe(404);
    });

    it('returns 400 for graduated token', async () => {
      await saveToken(makeToken({ contractAddress: 'bc1pgraduated00000000000000000000000000000a', _id: 'bc1pgraduated00000000000000000000000000000a', status: 'graduated' }));
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: 'bc1pgraduated00000000000000000000000000000a', btcAmountSats: '100000' }), {} as any);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.message).toContain('graduated');
    });

    it('returns 400 for amount below minimum', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: VALID_TOKEN_ADDRESS, btcAmountSats: '9999' }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing fields', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: VALID_TOKEN_ADDRESS }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid btcAmountSats (non-numeric)', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: VALID_TOKEN_ADDRESS, btcAmountSats: 'abc' }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 405 for GET method', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const req = new Request('http://localhost/api/v1/simulate/buy', { method: 'GET' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(405);
    });

    it('returns 400 when buy exceeds graduation threshold', async () => {
      const handler = (await import('../../functions/simulate-buy.mts')).default;
      const res = await handler(postBuy({ tokenAddress: VALID_TOKEN_ADDRESS, btcAmountSats: '10000000' }), {} as any);
      expect(res.status).toBe(400);
      const body = await res.json() as any;
      expect(body.error).toBe('SimulationError');
    });
  });

  describe('POST /api/v1/simulate/sell', () => {
    it('returns simulation result for valid sell', async () => {
      // Need a token with real BTC reserve (post-buy state) and correct kConstant
      await saveToken(makeToken({
        contractAddress: 'bc1ppostbuy000000000000000000000000000000a',
        _id: 'bc1ppostbuy000000000000000000000000000000a',
        virtualBtcReserve: '865750',
        virtualTokenSupply: '88596009723861720',
        kConstant: '76700000000000000000000',
        realBtcReserve: '98750',
      }));
      const handler = (await import('../../functions/simulate-sell.mts')).default;
      // Use a smaller sell amount that won't fall below MIN_TRADE_SATS output
      const res = await handler(postSell({ tokenAddress: 'bc1ppostbuy000000000000000000000000000000a', tokenAmount: '5000000000000000' }), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.btcOut).toBeDefined();
      expect(BigInt(body.btcOut)).toBeGreaterThan(0n);
    });

    it('returns 404 for non-existent token', async () => {
      const handler = (await import('../../functions/simulate-sell.mts')).default;
      const res = await handler(postSell({ tokenAddress: 'bc1pnonexistent0000000000000000000000000000a', tokenAmount: '1000' }), {} as any);
      expect(res.status).toBe(404);
    });
  });
});

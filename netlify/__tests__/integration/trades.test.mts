import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { saveToken, getToken, getOHLCV, getTopHolders } from '../../functions/_shared/redis-queries.mts';
import { makeToken, VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS, VALID_TX_HASH } from '../fixtures/index.js';

function postTrade(body: unknown): Request {
  return new Request('http://localhost/api/v1/trades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validTradeBody = {
  txHash: VALID_TX_HASH,
  tokenAddress: VALID_TOKEN_ADDRESS,
  type: 'buy' as const,
  traderAddress: VALID_TRADER_ADDRESS,
  btcAmount: '100000',
  tokenAmount: '11403990276138280',
  pricePerToken: '8770',
};

describe('trade endpoints', () => {
  beforeEach(async () => {
    resetMockRedis();
    await saveToken(makeToken());
  });

  describe('POST /api/v1/trades', () => {
    it('accepts valid buy trade', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      const res = await handler(postTrade(validTradeBody), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.ok).toBe(true);
      expect(body.txHash).toBe(VALID_TX_HASH);
    });

    it('returns 400 for missing fields', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      const res = await handler(postTrade({ txHash: VALID_TX_HASH }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 405 for wrong method', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      const req = new Request('http://localhost/api/v1/trades', { method: 'GET' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(405);
    });

    it('updates token reserves optimistically after buy', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      await handler(postTrade(validTradeBody), {} as any);

      const token = await getToken(VALID_TOKEN_ADDRESS);
      expect(token).not.toBeNull();
      expect(BigInt(token!.virtualBtcReserve)).toBeGreaterThan(767000n);
      expect(BigInt(token!.virtualTokenSupply)).toBeLessThan(100_000_000_000_000_000n);
    });

    it('updates token stats after trade', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      await handler(postTrade(validTradeBody), {} as any);

      const token = await getToken(VALID_TOKEN_ADDRESS);
      expect(token!.tradeCount).toBe(1);
      expect(BigInt(token!.volume24h)).toBeGreaterThan(0n);
    });

    it('creates OHLCV candle after trade', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      await handler(postTrade(validTradeBody), {} as any);

      const candles = await getOHLCV(VALID_TOKEN_ADDRESS, '1m', 10);
      expect(candles.length).toBeGreaterThan(0);
    });

    it('updates holder balance after buy', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      await handler(postTrade(validTradeBody), {} as any);

      const holders = await getTopHolders(VALID_TOKEN_ADDRESS, 10);
      expect(holders.length).toBeGreaterThan(0);
      expect(holders[0].address).toBe(VALID_TRADER_ADDRESS);
    });

    it('OPTIONS returns 204', async () => {
      const handler = (await import('../../functions/trades-submit.mts')).default;
      const req = new Request('http://localhost/api/v1/trades', { method: 'OPTIONS' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(204);
    });
  });

  describe('GET /api/v1/tokens/:address/trades', () => {
    it('returns paginated trades after submission', async () => {
      const submitHandler = (await import('../../functions/trades-submit.mts')).default;
      await submitHandler(postTrade(validTradeBody), {} as any);

      const tradesHandler = (await import('../../functions/tokens-trades.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens/' + VALID_TOKEN_ADDRESS + '/trades');
      const res = await tradesHandler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.trades.length).toBe(1);
      expect(body.trades[0].status).toBe('pending');
      expect(body.pagination.total).toBe(1);
    });

    it('caps limit at 100', async () => {
      const tradesHandler = (await import('../../functions/tokens-trades.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens/' + VALID_TOKEN_ADDRESS + '/trades?limit=200');
      const res = await tradesHandler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.pagination.limit).toBe(100);
    });
  });
});

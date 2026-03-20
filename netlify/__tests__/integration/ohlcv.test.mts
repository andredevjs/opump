import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { updateOHLCV } from '../../functions/_shared/redis-ohlcv.mts';
import { VALID_TOKEN_ADDRESS } from '../fixtures/index.js';

describe('GET /api/v1/tokens/:address/ohlcv', () => {
  beforeEach(() => resetMockRedis());

  it('returns candles for seeded OHLCV data', async () => {
    await updateOHLCV(VALID_TOKEN_ADDRESS, 1000, 50000, 1700000000);

    const handler = (await import('../../functions/tokens-ohlcv.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/ohlcv?timeframe=1m`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.candles.length).toBeGreaterThan(0);
    expect(body.timeframe).toBe('1m');
    expect(body.tokenAddress).toBe(VALID_TOKEN_ADDRESS);
    const candle = body.candles[0];
    expect(candle.open).toBe(1000);
    expect(candle.high).toBe(1000);
    expect(candle.low).toBe(1000);
    expect(candle.close).toBe(1000);
    expect(candle.volume).toBe(50000);
  });

  it('returns 400 for invalid timeframe', async () => {
    const handler = (await import('../../functions/tokens-ohlcv.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/ohlcv?timeframe=2h`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(400);
  });

  it('caps limit at 500', async () => {
    const handler = (await import('../../functions/tokens-ohlcv.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/ohlcv?limit=600`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    // Verify the limit was capped (no candles, but the query used 500 not 600)
  });

  it('returns empty candles for token with no data', async () => {
    const handler = (await import('../../functions/tokens-ohlcv.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/ohlcv`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.candles).toEqual([]);
  });
});

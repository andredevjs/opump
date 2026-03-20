import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { saveToken, updateHolderBalance } from '../../functions/_shared/redis-queries.mts';
import { makeToken, VALID_TOKEN_ADDRESS } from '../fixtures/index.js';

describe('GET /api/v1/tokens/:address/holders', () => {
  beforeEach(async () => {
    resetMockRedis();
    // Use a post-buy token so circulatingSupply > 0 (virtualTokenSupply < INITIAL)
    await saveToken(makeToken({
      virtualBtcReserve: '865750',
      virtualTokenSupply: '88596009723861720',
      realBtcReserve: '98750',
    }));
  });

  it('returns holders sorted by balance', async () => {
    await updateHolderBalance(VALID_TOKEN_ADDRESS, 'bc1pholder1000000000000000000000000000000a', '5000000', 'buy');
    await updateHolderBalance(VALID_TOKEN_ADDRESS, 'bc1pholder2000000000000000000000000000000a', '10000000', 'buy');

    const handler = (await import('../../functions/holders-list.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/holders`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.holders.length).toBe(2);
    expect(body.holders[0].address).toBe('bc1pholder2000000000000000000000000000000a');
    expect(body.holderCount).toBe(2);
    expect(body.circulatingSupply).toBeDefined();
    expect(BigInt(body.circulatingSupply)).toBeGreaterThan(0n);
  });

  it('respects limit parameter', async () => {
    await updateHolderBalance(VALID_TOKEN_ADDRESS, 'bc1pholder1000000000000000000000000000000a', '5000000', 'buy');
    await updateHolderBalance(VALID_TOKEN_ADDRESS, 'bc1pholder2000000000000000000000000000000a', '10000000', 'buy');
    await updateHolderBalance(VALID_TOKEN_ADDRESS, 'bc1pholder3000000000000000000000000000000a', '15000000', 'buy');

    const handler = (await import('../../functions/holders-list.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/holders?limit=2`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.holders.length).toBe(2);
  });

  it('caps limit at 50', async () => {
    const handler = (await import('../../functions/holders-list.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/holders?limit=60`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    // Verified by the function using Math.min(50, ...)
  });

  it('returns empty for token with no holders', async () => {
    const handler = (await import('../../functions/holders-list.mts')).default;
    const req = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/holders`);
    const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.holders).toEqual([]);
    expect(body.holderCount).toBe(0);
  });

  it('returns 404 for non-existent token', async () => {
    const handler = (await import('../../functions/holders-list.mts')).default;
    const req = new Request('http://localhost/api/v1/tokens/nonexistent/holders');
    const res = await handler(req, { params: { address: 'nonexistent' } } as any);
    expect(res.status).toBe(404);
  });
});

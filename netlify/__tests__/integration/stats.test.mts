import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { updateStats } from '../../functions/_shared/redis-queries.mts';

describe('GET /api/stats', () => {
  beforeEach(() => resetMockRedis());

  it('returns stats with seeded data', async () => {
    await updateStats({ totalTokens: 10, totalGraduated: 2, totalVolumeSats: '5000000', totalTrades: 100, lastBlockIndexed: 500 });

    const handler = (await import('../../functions/stats.mts')).default;
    const req = new Request('http://localhost/api/stats');
    const res = await handler(req, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.totalTokens).toBe(10);
    expect(body.totalGraduated).toBe(2);
    expect(body.totalVolumeSats).toBe('5000000');
    expect(body.totalTrades).toBe(100);
    expect(body.lastBlockIndexed).toBe(500);
  });

  it('returns zeros for empty platform', async () => {
    const handler = (await import('../../functions/stats.mts')).default;
    const req = new Request('http://localhost/api/stats');
    const res = await handler(req, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.totalTokens).toBe(0);
    expect(body.totalTrades).toBe(0);
    expect(body.totalVolumeSats).toBe('0');
  });

  it('OPTIONS returns 204', async () => {
    const handler = (await import('../../functions/stats.mts')).default;
    const req = new Request('http://localhost/api/stats', { method: 'OPTIONS' });
    const res = await handler(req, {} as any);
    expect(res.status).toBe(204);
  });
});

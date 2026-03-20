import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetMockRedis, mockRedis } from '../mocks/redis-mock.js';

describe('health endpoints', () => {
  beforeEach(() => resetMockRedis());

  describe('GET /api/health', () => {
    it('returns 200 with status ok when Redis is reachable', async () => {
      const handler = (await import('../../functions/health.mts')).default;
      const req = new Request('http://localhost/api/health', { method: 'GET' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });

    it('returns 503 when Redis ping fails', async () => {
      const origPing = mockRedis.ping;
      mockRedis.ping = async () => { throw new Error('connection refused'); };
      try {
        const handler = (await import('../../functions/health.mts')).default;
        const req = new Request('http://localhost/api/health', { method: 'GET' });
        const res = await handler(req, {} as any);
        expect(res.status).toBe(503);
        const body = await res.json() as any;
        expect(body.status).toBe('error');
      } finally {
        mockRedis.ping = origPing;
      }
    });

    it('OPTIONS returns 204 with CORS headers', async () => {
      const handler = (await import('../../functions/health.mts')).default;
      const req = new Request('http://localhost/api/health', { method: 'OPTIONS' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('GET /api/health/debug', () => {
    it('returns 200 with healthy status and check sections', async () => {
      const handler = (await import('../../functions/health-debug.mts')).default;
      const req = new Request('http://localhost/api/health/debug', { method: 'GET' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.status).toBe('healthy');
      expect(body.checks.env).toBeDefined();
      expect(body.checks.redis).toBeDefined();
      expect(body.checks.redis.status).toBe('ok');
      expect(body.checks.data).toBeDefined();
    });

    it('handles empty Redis without crashing', async () => {
      const handler = (await import('../../functions/health-debug.mts')).default;
      const req = new Request('http://localhost/api/health/debug', { method: 'GET' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      // totalTokens comes from zcard which returns 0 for empty sorted sets
      expect(body.checks.data).toBeDefined();
    });
  });
});

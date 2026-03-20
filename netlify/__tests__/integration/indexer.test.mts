import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { resetOpnetMock } from '../mocks/opnet-mock.js';
import { setLastBlockIndexed, getLastBlockIndexed, acquireIndexerLock, releaseIndexerLock } from '../../functions/_shared/redis-queries.mts';

describe('indexer endpoints', () => {
  beforeEach(() => {
    resetMockRedis();
    resetOpnetMock();
  });

  describe('GET /api/v1/indexer/run', () => {
    it('returns current indexer state with valid auth', async () => {
      await setLastBlockIndexed(50);
      const handler = (await import('../../functions/indexer-run.mts')).default;
      const req = new Request('http://localhost/api/v1/indexer/run', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-indexer-key' },
      });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.lastBlock).toBe(50);
      expect(body.status).toBe('ok');
    });

    it('returns 401 without auth when INDEXER_API_KEY is set', async () => {
      const handler = (await import('../../functions/indexer-run.mts')).default;
      const req = new Request('http://localhost/api/v1/indexer/run', { method: 'GET' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(401);
    });
  });

  describe('indexer lock', () => {
    it('acquireIndexerLock succeeds first time', async () => {
      expect(await acquireIndexerLock()).toBe(true);
    });

    it('acquireIndexerLock fails when already held', async () => {
      await acquireIndexerLock();
      expect(await acquireIndexerLock()).toBe(false);
    });

    it('releaseIndexerLock allows re-acquisition', async () => {
      await acquireIndexerLock();
      await releaseIndexerLock();
      expect(await acquireIndexerLock()).toBe(true);
    });
  });

  describe('indexer state', () => {
    it('get/setLastBlockIndexed roundtrip', async () => {
      expect(await getLastBlockIndexed()).toBe(0);
      await setLastBlockIndexed(100);
      expect(await getLastBlockIndexed()).toBe(100);
    });
  });
});

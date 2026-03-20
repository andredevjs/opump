import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { resetBlobStore } from '../mocks/blobs-mock.js';

function postImage(body: unknown, ip = '127.0.0.1'): Request {
  return new Request('http://localhost/api/images', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('image endpoints', () => {
  beforeEach(() => {
    resetMockRedis();
    resetBlobStore();
  });

  describe('POST /api/images (upload)', () => {
    const validImage = { data: btoa('x'.repeat(100)), contentType: 'image/png' };

    it('uploads valid PNG and returns URL', async () => {
      const handler = (await import('../../functions/upload-image.mts')).default;
      const res = await handler(postImage(validImage), {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.url).toContain('/api/images/');
    });

    it('returns 400 for invalid content type', async () => {
      const handler = (await import('../../functions/upload-image.mts')).default;
      const res = await handler(postImage({ data: btoa('x'), contentType: 'application/pdf' }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing data', async () => {
      const handler = (await import('../../functions/upload-image.mts')).default;
      const res = await handler(postImage({ contentType: 'image/png' }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing contentType', async () => {
      const handler = (await import('../../functions/upload-image.mts')).default;
      const res = await handler(postImage({ data: btoa('x') }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 429 after 10 uploads from same IP', async () => {
      const handler = (await import('../../functions/upload-image.mts')).default;
      for (let i = 0; i < 10; i++) {
        const res = await handler(postImage(validImage, '1.2.3.4'), {} as any);
        expect(res.status).toBe(200);
      }
      const res = await handler(postImage(validImage, '1.2.3.4'), {} as any);
      expect(res.status).toBe(429);
    });
  });

  describe('GET /api/images/:key (serve)', () => {
    it('returns 404 for non-existent key', async () => {
      const handler = (await import('../../functions/serve-image.mts')).default;
      const req = new Request('http://localhost/api/images/nonexistent.png');
      const res = await handler(req, { params: { key: 'nonexistent.png' } } as any);
      expect(res.status).toBe(404);
    });
  });
});

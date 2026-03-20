import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { resetOpnetMock } from '../mocks/opnet-mock.js';
import { saveToken } from '../../functions/_shared/redis-queries.mts';
import { makeToken, makeCreateTokenRequest, VALID_TOKEN_ADDRESS, VALID_CREATOR_ADDRESS } from '../fixtures/index.js';

function postToken(body: unknown): Request {
  return new Request('http://localhost/api/v1/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('token endpoints', () => {
  beforeEach(() => {
    resetMockRedis();
    resetOpnetMock();
  });

  describe('POST /api/v1/tokens (create)', () => {
    it('creates token with valid body', async () => {
      const handler = (await import('../../functions/tokens-list.mts')).default;
      const res = await handler(postToken(makeCreateTokenRequest()), {} as any);
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.name).toBe('TestToken');
      expect(body.symbol).toBe('TEST');
      expect(body.virtualBtcReserve).toBe('767000');
      expect(body.status).toBe('active');
    });

    it('returns 400 for missing fields', async () => {
      const handler = (await import('../../functions/tokens-list.mts')).default;
      const res = await handler(postToken({ name: 'Test' }), {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid JSON', async () => {
      const handler = (await import('../../functions/tokens-list.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(400);
    });

    it('returns 409 for duplicate address', async () => {
      const handler = (await import('../../functions/tokens-list.mts')).default;
      await handler(postToken(makeCreateTokenRequest()), {} as any);
      const res = await handler(postToken(makeCreateTokenRequest()), {} as any);
      expect(res.status).toBe(409);
    });
  });

  describe('GET /api/v1/tokens (list)', () => {
    it('returns paginated token list', async () => {
      await saveToken(makeToken({ contractAddress: 'bc1ptoken1000000000000000000000000000000000a', _id: 'bc1ptoken1000000000000000000000000000000000a', name: 'Token1' }));
      await saveToken(makeToken({ contractAddress: 'bc1ptoken2000000000000000000000000000000000a', _id: 'bc1ptoken2000000000000000000000000000000000a', name: 'Token2' }));

      const handler = (await import('../../functions/tokens-list.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens?page=1&limit=10');
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.tokens.length).toBe(2);
      expect(body.pagination.total).toBe(2);
      expect(body.pagination.page).toBe(1);
    });

    it('filters by search', async () => {
      await saveToken(makeToken({ contractAddress: 'bc1palpha00000000000000000000000000000000a', _id: 'bc1palpha00000000000000000000000000000000a', name: 'AlphaToken', symbol: 'ALPHA' }));
      await saveToken(makeToken({ contractAddress: 'bc1pbeta000000000000000000000000000000000a', _id: 'bc1pbeta000000000000000000000000000000000a', name: 'BetaToken', symbol: 'BETA' }));

      const handler = (await import('../../functions/tokens-list.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens?search=alpha');
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.tokens.length).toBe(1);
      expect(body.tokens[0].name).toBe('AlphaToken');
    });

    it('filters by status', async () => {
      await saveToken(makeToken({ contractAddress: 'bc1pactive0000000000000000000000000000000a', _id: 'bc1pactive0000000000000000000000000000000a', status: 'active' }));
      await saveToken(makeToken({ contractAddress: 'bc1pgrad00000000000000000000000000000000a', _id: 'bc1pgrad00000000000000000000000000000000a', status: 'graduated' }));

      const handler = (await import('../../functions/tokens-list.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens?status=active');
      const res = await handler(req, {} as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.tokens.length).toBe(1);
      expect(body.tokens[0].status).toBe('active');
    });

    it('OPTIONS returns 204 with CORS', async () => {
      const handler = (await import('../../functions/tokens-list.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens', { method: 'OPTIONS' });
      const res = await handler(req, {} as any);
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('GET /api/v1/tokens/:address (detail)', () => {
    it('returns token for existing address', async () => {
      await saveToken(makeToken());
      const handler = (await import('../../functions/tokens-detail.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens/' + VALID_TOKEN_ADDRESS);
      const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.name).toBe('TestToken');
      expect(body.priceChange24hBps).toBeDefined();
    });

    it('returns 404 for non-existent address', async () => {
      const handler = (await import('../../functions/tokens-detail.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens/bc1pnonexistent0000000000000000000000000000a');
      const res = await handler(req, { params: { address: 'bc1pnonexistent0000000000000000000000000000a' } } as any);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/tokens/:address/price', () => {
    it('returns price data for existing token', async () => {
      await saveToken(makeToken());
      const handler = (await import('../../functions/tokens-price.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens/' + VALID_TOKEN_ADDRESS + '/price');
      const res = await handler(req, { params: { address: VALID_TOKEN_ADDRESS } } as any);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.currentPriceSats).toBeDefined();
      expect(body.virtualBtcReserve).toBeDefined();
      expect(body.virtualTokenSupply).toBeDefined();
      expect(body.realBtcReserve).toBeDefined();
      expect(body.change24hBps).toBeDefined();
    });

    it('returns 404 for non-existent token', async () => {
      const handler = (await import('../../functions/tokens-price.mts')).default;
      const req = new Request('http://localhost/api/v1/tokens/none/price');
      const res = await handler(req, { params: { address: 'none' } } as any);
      expect(res.status).toBe(404);
    });
  });
});

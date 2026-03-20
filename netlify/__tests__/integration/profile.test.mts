import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { saveToken } from '../../functions/_shared/redis-queries.mts';
import { makeToken, VALID_CREATOR_ADDRESS } from '../fixtures/index.js';

describe('GET /api/v1/profile/:address/tokens', () => {
  beforeEach(() => resetMockRedis());

  it('returns all tokens created by wallet', async () => {
    await saveToken(makeToken({ contractAddress: 'bc1pprofile1000000000000000000000000000000a', _id: 'bc1pprofile1000000000000000000000000000000a', name: 'Token1' }));
    await saveToken(makeToken({ contractAddress: 'bc1pprofile2000000000000000000000000000000a', _id: 'bc1pprofile2000000000000000000000000000000a', name: 'Token2' }));
    await saveToken(makeToken({ contractAddress: 'bc1pprofile3000000000000000000000000000000a', _id: 'bc1pprofile3000000000000000000000000000000a', name: 'Token3' }));

    const handler = (await import('../../functions/profile-tokens.mts')).default;
    const req = new Request(`http://localhost/api/v1/profile/${VALID_CREATOR_ADDRESS}/tokens`);
    const res = await handler(req, { params: { address: VALID_CREATOR_ADDRESS } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.address).toBe(VALID_CREATOR_ADDRESS);
    expect(body.tokens.length).toBe(3);
    expect(body.total).toBe(3);
  });

  it('returns empty for wallet with no tokens', async () => {
    const handler = (await import('../../functions/profile-tokens.mts')).default;
    const req = new Request('http://localhost/api/v1/profile/bc1pempty000000000000000000000000000000000a/tokens');
    const res = await handler(req, { params: { address: 'bc1pempty000000000000000000000000000000000a' } } as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.tokens).toEqual([]);
    expect(body.total).toBe(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { checkRateLimit, checkIpRateLimit, checkCreateRateLimit } from '../../functions/_shared/rate-limit.mts';

describe('checkRateLimit()', () => {
  beforeEach(() => resetMockRedis());

  it('allows first 3 requests with maxRequests=3', async () => {
    expect(await checkRateLimit('test:key', 3, 60)).toBe(true);
    expect(await checkRateLimit('test:key', 3, 60)).toBe(true);
    expect(await checkRateLimit('test:key', 3, 60)).toBe(true);
  });

  it('rejects the 4th request when maxRequests=3', async () => {
    await checkRateLimit('test:key', 3, 60);
    await checkRateLimit('test:key', 3, 60);
    await checkRateLimit('test:key', 3, 60);
    expect(await checkRateLimit('test:key', 3, 60)).toBe(false);
  });
});

describe('checkIpRateLimit()', () => {
  beforeEach(() => resetMockRedis());

  it('allows 100 requests with defaults and rejects the 101st', async () => {
    const ip = '192.168.1.1';
    for (let i = 0; i < 100; i++) {
      expect(await checkIpRateLimit(ip)).toBe(true);
    }
    expect(await checkIpRateLimit(ip)).toBe(false);
  });
});

describe('checkCreateRateLimit()', () => {
  beforeEach(() => resetMockRedis());

  it('allows 3 creates and rejects the 4th', async () => {
    const wallet = 'bc1pwalletaddress';
    expect(await checkCreateRateLimit(wallet)).toBe(true);
    expect(await checkCreateRateLimit(wallet)).toBe(true);
    expect(await checkCreateRateLimit(wallet)).toBe(true);
    expect(await checkCreateRateLimit(wallet)).toBe(false);
  });
});

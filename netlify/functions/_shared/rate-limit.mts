import { getRedis } from "./redis.mts";

/**
 * Redis-based rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const redis = getRedis();
  const current = await redis.incr(key);
  // Always set expire to prevent keys persisting after crash between incr and expire
  await redis.expire(key, windowSeconds);
  return current <= maxRequests;
}

/**
 * Check IP-based rate limit with configurable prefix, limit, and window.
 * Defaults: 100 requests per 60 seconds.
 */
export async function checkIpRateLimit(ip: string, prefix = 'ip', maxRequests = 100, windowSeconds = 60): Promise<boolean> {
  return checkRateLimit(`op:rl:${prefix}:${ip}`, maxRequests, windowSeconds);
}

/**
 * Check wallet-based token creation rate limit: 3 per hour.
 */
export async function checkCreateRateLimit(walletAddress: string): Promise<boolean> {
  return checkRateLimit(`op:rl:create:${walletAddress}`, 3, 3600);
}

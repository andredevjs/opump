import type HyperExpress from '@btc-vision/hyper-express';

const windowMs = 60_000; // 1 minute
const maxRequests = 100; // per IP per window

const ipCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Simple in-memory rate limiter (100 req/min per IP).
 */
export function rateLimit(req: HyperExpress.Request, res: HyperExpress.Response, next: () => void): void {
  const ip = req.ip;
  const now = Date.now();

  const entry = ipCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    res.status(429).json({
      error: 'TooManyRequests',
      message: 'Rate limit exceeded. Try again later.',
      statusCode: 429,
    });
    return;
  }

  next();
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipCounts) {
    if (now > entry.resetAt) {
      ipCounts.delete(ip);
    }
  }
}, 300_000);

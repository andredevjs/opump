/**
 * One-off migration: re-score all tokens in the "newest" sorted set
 * using createdAt timestamp instead of the old deployBlock-based score.
 *
 * Usage: GET /api/migrate-newest-index
 * Safe to run multiple times (idempotent).
 * Delete this function after running it once.
 */

import type { Context } from "@netlify/functions";
import { json, corsHeaders } from "./_shared/response.mts";
import { getRedis } from "./_shared/redis.mts";

const TOKEN_INDEX = (status: string, sort: string) => `op:idx:token:${status}:${sort}`;
const TOKEN_KEY = (addr: string) => `op:token:${addr}`;

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const redis = getRedis();

  // Get ALL token addresses from the "all:newest" index
  const allAddresses: string[] = await redis.zrange(TOKEN_INDEX("all", "newest"), 0, -1);

  if (allAddresses.length === 0) {
    return json({ message: "No tokens found", updated: 0 });
  }

  // Read createdAt and status for each token
  const readPipe = redis.pipeline();
  for (const addr of allAddresses) {
    readPipe.hmget(TOKEN_KEY(addr), "createdAt", "status");
  }
  const results = await readPipe.exec();

  // Re-score each token in both its status-specific and "all" indexes
  const writePipe = redis.pipeline();
  let updated = 0;

  for (let i = 0; i < allAddresses.length; i++) {
    const addr = allAddresses[i];
    const data = results[i] as [string | null, string | null] | null;
    const createdAt = data?.[0];
    const status = data?.[1] || "active";

    const score = createdAt ? new Date(createdAt).getTime() : Date.now();

    writePipe.zadd(TOKEN_INDEX("all", "newest"), { score, member: addr });
    writePipe.zadd(TOKEN_INDEX(status, "newest"), { score, member: addr });
    updated++;
  }

  await writePipe.exec();

  return json({
    message: `Re-scored ${updated} tokens in "newest" index using createdAt`,
    updated,
    tokens: allAddresses.length,
  });
};

import type { Context } from "@netlify/functions";
import { json, corsHeaders } from "./_shared/response.mts";
import { getRedis } from "./_shared/redis.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const redis = getRedis();
    await redis.ping();
    return json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return json({ status: "error", message: "Redis connection failed" }, 503);
  }
};

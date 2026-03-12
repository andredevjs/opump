const FRONTEND_URL = process.env.FRONTEND_URL || "*";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": FRONTEND_URL,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

export function error(message: string, status = 400, errorCode = "BadRequest"): Response {
  return json({ error: errorCode, message, statusCode: status }, status);
}

/**
 * Extract a parameter from the URL — tries query string first, then falls back
 * to a path segment. Netlify Functions v2 receives the original request URL,
 * so `:param` substitution in redirect `to` query strings doesn't propagate.
 */
export function getParam(url: URL, name: string, pathIndex: number): string | null {
  return url.searchParams.get(name) ?? url.pathname.split("/")[pathIndex] ?? null;
}

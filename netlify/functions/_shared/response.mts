const FRONTEND_URL = process.env.FRONTEND_URL || (() => {
  console.warn('[CORS] FRONTEND_URL not set — defaulting to wildcard origin "*"');
  return '*';
})();

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
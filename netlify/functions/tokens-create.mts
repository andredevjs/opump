import type { Context } from "@netlify/functions";
import { error, corsHeaders } from "./_shared/response.mts";
import { handleCreateToken } from "./_shared/create-token.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  return handleCreateToken(req);
};

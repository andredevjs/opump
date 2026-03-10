import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { uploadImage } from "./_shared/image-storage.mts";

export default async (req: Request, _context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== "POST") {
    return error("Method not allowed", 405, "MethodNotAllowed");
  }

  let body: { data?: string; contentType?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  if (typeof body.data !== "string" || !body.data) {
    return error("Missing required field: data (base64 encoded image)", 400);
  }
  if (typeof body.contentType !== "string" || !body.contentType) {
    return error("Missing required field: contentType (e.g. image/png)", 400);
  }

  try {
    const result = await uploadImage(body.data, body.contentType);
    return json({ url: result.url });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Upload failed", 400);
  }
};

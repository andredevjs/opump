import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { error, corsHeaders } from "./_shared/response.mts";

export default async (req: Request, context: Context) => {
  const key = context.params?.key;
  if (!key || !/^[\w.-]+$/.test(key)) {
    return error('Invalid key', 400, 'BadRequest');
  }

  const store = getStore("token-images");
  const entry = await store.getWithMetadata(key, { type: "arrayBuffer" });

  if (!entry) {
    return new Response("Image not found", { status: 404 });
  }

  const contentType = (entry.metadata?.contentType as string) || "image/png";

  return new Response(entry.data, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...corsHeaders(),
    },
  });
};

export const config: Config = {
  path: "/api/images/:key",
  method: ["GET", "OPTIONS"],
};

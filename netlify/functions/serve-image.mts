import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
import { getParam } from "./_shared/response.mts";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const key = getParam(url, "key", 3); // /api/images/:key

  if (!key) {
    return new Response("Missing key", { status: 400 });
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
      "Access-Control-Allow-Origin": "*",
    },
  });
};

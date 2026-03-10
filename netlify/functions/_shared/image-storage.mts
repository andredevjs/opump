/**
 * Image storage service — uses Netlify Blobs.
 * Stores images in a "token-images" blob store, serves via /api/images/:key.
 */

import { getStore } from "@netlify/blobs";

const MAX_IMAGE_BYTES = 500_000; // 500KB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"]);

export interface UploadResult {
  url: string;
}

export async function uploadImage(base64Data: string, contentType: string): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Unsupported image type: ${contentType}. Allowed: ${[...ALLOWED_TYPES].join(", ")}`);
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes limit (got ${buffer.length})`);
  }

  const ext = contentType.split("/")[1]?.replace("svg+xml", "svg") || "png";
  const key = `${Date.now()}-${randomHex(8)}.${ext}`;

  const store = getStore("token-images");
  await store.set(key, new Uint8Array(buffer).buffer as ArrayBuffer, {
    metadata: { contentType },
  });

  // Return a URL that points to our serve-image function
  const siteUrl = process.env.URL || process.env.FRONTEND_URL || "";
  const url = `${siteUrl}/api/images/${key}`;

  return { url };
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

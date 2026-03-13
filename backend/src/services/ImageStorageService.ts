import { config } from '../config/env.js';

const MAX_IMAGE_BYTES = 500_000; // 500KB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

export interface UploadResult {
  url: string;
}

/**
 * Upload an image to S3/R2 object storage.
 * Falls back to returning a data URI when S3 is not configured (dev mode).
 */
export async function uploadImage(base64Data: string, contentType: string): Promise<UploadResult> {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error(`Unsupported image type: ${contentType}. Allowed: ${[...ALLOWED_TYPES].join(', ')}`);
  }

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes limit (got ${bytes.length})`);
  }

  // Dev fallback: return data URI when S3 is not configured
  if (!config.s3Bucket) {
    return { url: `data:${contentType};base64,${base64Data}` };
  }

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const client = new S3Client({
    region: config.s3Region,
    endpoint: config.s3Endpoint || undefined,
    forcePathStyle: !!config.s3Endpoint, // Required for R2 and MinIO
    credentials: {
      accessKeyId: config.s3AccessKey,
      secretAccessKey: config.s3SecretKey,
    },
  });

  const ext = contentType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
  const key = `token-images/${Date.now()}-${randomHex(8)}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  // Build the public URL
  const url = config.s3PublicUrl
    ? `${config.s3PublicUrl}/${key}`
    : `https://${config.s3Bucket}.s3.${config.s3Region}.amazonaws.com/${key}`;

  return { url };
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

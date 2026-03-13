import type HyperExpress from '@btc-vision/hyper-express';
import { uploadImage } from '../services/ImageStorageService.js';
import type { UploadImageRequest, UploadImageResponse } from '../../../shared/types/api.js';

// Stricter IP-based rate limiting for uploads (10 per minute per IP)
const UPLOAD_WINDOW_MS = 60_000;
const UPLOAD_MAX_PER_IP = 10;
const uploadIpCounts = new Map<string, { count: number; resetAt: number }>();

function checkUploadRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = uploadIpCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    uploadIpCounts.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= UPLOAD_MAX_PER_IP;
}

export function registerUploadRoutes(app: HyperExpress.Server): void {
  /**
   * POST /v1/upload/image
   * Accepts base64 image data, uploads to S3/R2, returns URL.
   * Falls back to data URI when S3 is not configured.
   */
  app.post('/v1/upload/image', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkUploadRateLimit(clientIp)) {
      res.status(429).json({
        error: 'TooManyRequests',
        message: 'Upload rate limit exceeded. Max 10 uploads per minute.',
        statusCode: 429,
      });
      return;
    }

    let body: UploadImageRequest;
    try {
      body = (await req.json()) as UploadImageRequest;
    } catch {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid JSON body',
        statusCode: 400,
      });
      return;
    }

    if (typeof body.data !== 'string' || !body.data) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Missing required field: data (base64 encoded image)',
        statusCode: 400,
      });
      return;
    }

    if (typeof body.contentType !== 'string' || !body.contentType) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Missing required field: contentType (e.g. image/png)',
        statusCode: 400,
      });
      return;
    }

    try {
      const result = await uploadImage(body.data, body.contentType);
      const response: UploadImageResponse = { url: result.url };
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      res.status(400).json({
        error: 'BadRequest',
        message,
        statusCode: 400,
      });
    }
  });
}

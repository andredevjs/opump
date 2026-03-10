import type HyperExpress from '@btc-vision/hyper-express';
import { uploadImage } from '../services/ImageStorageService.js';
import type { UploadImageRequest, UploadImageResponse } from '../../../shared/types/api.js';

export function registerUploadRoutes(app: HyperExpress.Server): void {
  /**
   * POST /v1/upload/image
   * Accepts base64 image data, uploads to S3/R2, returns URL.
   * Falls back to data URI when S3 is not configured.
   */
  app.post('/v1/upload/image', async (req, res) => {
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

import type HyperExpress from '@btc-vision/hyper-express';

/**
 * Validates that request body contains required fields.
 */
export function validateBody(requiredFields: string[]) {
  return async (req: HyperExpress.Request, res: HyperExpress.Response, next: () => void) => {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid JSON body',
        statusCode: 400,
      });
      return;
    }

    const missing = requiredFields.filter((f) => !(f in body) || body[f] === undefined);
    if (missing.length > 0) {
      res.status(400).json({
        error: 'BadRequest',
        message: `Missing required fields: ${missing.join(', ')}`,
        statusCode: 400,
      });
      return;
    }

    next();
  };
}

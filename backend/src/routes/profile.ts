import type HyperExpress from '@btc-vision/hyper-express';
import { getTokensCollection } from '../db/models/Token.js';

export function registerProfileRoutes(app: HyperExpress.Server): void {
  // GET /v1/profile/:address/tokens — tokens created by address
  app.get('/v1/profile/:address/tokens', async (req, res) => {
    const { address } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const tokens = getTokensCollection();
    const filter = { creatorAddress: address };
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      tokens
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      tokens.countDocuments(filter),
    ]);

    res.json({
      address,
      tokens: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });
}

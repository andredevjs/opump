import type HyperExpress from '@btc-vision/hyper-express';
import { getTokensCollection } from '../db/models/Token.js';

export function registerProfileRoutes(app: HyperExpress.Server): void {
  // GET /v1/profile/:address/tokens — tokens created by address
  app.get('/v1/profile/:address/tokens', async (req, res) => {
    const { address } = req.params;
    const tokens = getTokensCollection();

    const results = await tokens
      .find({ creatorAddress: address })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      address,
      tokens: results,
      total: results.length,
    });
  });
}

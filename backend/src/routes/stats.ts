import type HyperExpress from '@btc-vision/hyper-express';
import { getPlatformStatsCollection } from '../db/models/PlatformStats.js';

export function registerStatsRoutes(app: HyperExpress.Server): void {
  // GET /v1/stats — platform statistics
  app.get('/v1/stats', async (_req, res) => {
    const stats = getPlatformStatsCollection();
    const current = await stats.findOne({ _id: 'current' });

    res.json({
      totalTokens: current?.totalTokens ?? 0,
      totalGraduated: current?.totalGraduated ?? 0,
      totalVolumeSats: current?.totalVolumeSats ?? '0',
      totalTrades: current?.totalTrades ?? 0,
      lastBlockIndexed: current?.lastBlockIndexed ?? 0,
    });
  });
}

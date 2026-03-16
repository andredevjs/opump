import type { Collection } from 'mongodb';
import { getDb } from '../connection.js';

export interface PlatformStatsDocument {
  _id: 'current';
  totalTokens: number;
  totalGraduated: number;
  totalVolumeSats: string;
  totalTrades: number;
  lastBlockIndexed: number;
  updatedAt: Date;
}

export function getPlatformStatsCollection(): Collection<PlatformStatsDocument> {
  return getDb().collection<PlatformStatsDocument>('platform_stats');
}

export async function getOrCreateStats(): Promise<PlatformStatsDocument> {
  const collection = getPlatformStatsCollection();
  const stats = await collection.findOne({ _id: 'current' });

  if (stats) return stats;

  const initial: PlatformStatsDocument = {
    _id: 'current',
    totalTokens: 0,
    totalGraduated: 0,
    totalVolumeSats: '0',
    totalTrades: 0,
    lastBlockIndexed: 0,
    updatedAt: new Date(),
  };

  await collection.insertOne(initial);
  return initial;
}

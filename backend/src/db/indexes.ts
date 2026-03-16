import { getTokensCollection } from './models/Token.js';
import { getTradesCollection } from './models/Trade.js';

export async function ensureIndexes(): Promise<void> {
  const tokens = getTokensCollection();
  const trades = getTradesCollection();

  await Promise.all([
    // Token indexes
    tokens.createIndex({ status: 1, volume24h: -1 }),
    tokens.createIndex({ creatorAddress: 1 }),
    tokens.createIndex({ name: 'text', symbol: 'text' }),
    tokens.createIndex({ deployBlock: -1 }),
    tokens.createIndex({ currentPriceSats: -1 }),

    // Trade indexes
    trades.createIndex({ tokenAddress: 1, createdAt: -1 }),
    trades.createIndex({ traderAddress: 1, createdAt: -1 }),
    trades.createIndex({ status: 1, tokenAddress: 1 }),
    trades.createIndex({ blockNumber: -1 }),
  ]);

  console.log('[DB] Indexes ensured');
}

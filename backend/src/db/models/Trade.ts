import type { Collection } from 'mongodb';
import type { TradeDocument } from '../../../../shared/types/trade.js';
import { getDb } from '../connection.js';

export function getTradesCollection(): Collection<TradeDocument> {
  return getDb().collection<TradeDocument>('trades');
}

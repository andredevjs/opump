import type { Collection } from 'mongodb';
import type { TokenDocument } from '../../../../shared/types/token.js';
import { getDb } from '../connection.js';

export function getTokensCollection(): Collection<TokenDocument> {
  return getDb().collection<TokenDocument>('tokens');
}

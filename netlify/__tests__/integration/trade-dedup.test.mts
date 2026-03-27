/**
 * Integration test: Trade deduplication lifecycle.
 * Validates that a pending trade (keyed by TXID) is correctly overwritten
 * when the indexer confirms it (also keyed by TXID, resolved from WTXID).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import {
  saveToken, saveTrade, listTradesForToken,
  getTopHolders, getHolderCount,
} from '../../functions/_shared/redis-queries.mts';
import { makeToken, makeTrade, VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS } from '../fixtures/index.js';

const TXID = 'd'.repeat(64);
const WTXID = 'e'.repeat(64);

describe('trade deduplication lifecycle', () => {
  beforeEach(async () => {
    resetMockRedis();
    await saveToken(makeToken());
  });

  it('pending trade overwritten by confirmed trade with same TXID produces exactly one record', async () => {
    // Step 1: Frontend submits pending trade with TXID
    const pendingCreatedAt = new Date('2026-01-20T12:00:00Z');
    const { isNew: isNew1 } = await saveTrade(makeTrade({
      _id: TXID,
      status: 'pending',
      traderAddress: VALID_TRADER_ADDRESS,
      btcAmount: '50000',
      tokenAmount: '10000000',
      createdAt: pendingCreatedAt,
    }));
    expect(isNew1).toBe(true);

    // Step 2: Indexer confirms trade with same TXID (resolved from WTXID)
    const { isNew: isNew2 } = await saveTrade(makeTrade({
      _id: TXID,
      txHash: WTXID,
      status: 'confirmed',
      traderAddress: VALID_TRADER_ADDRESS,
      btcAmount: '50000',
      tokenAmount: '9999500', // Slightly different due to on-chain execution
      blockNumber: 1000,
      blockTimestamp: new Date('2026-01-20T12:05:00Z'),
      createdAt: new Date('2026-01-20T12:05:00Z'),
    }));
    expect(isNew2).toBe(false);

    // Step 3: Verify exactly ONE trade record exists
    const { trades, total } = await listTradesForToken(VALID_TOKEN_ADDRESS, 1, 100);
    expect(total).toBe(1);
    expect(trades.length).toBe(1);

    const trade = trades[0];
    expect(trade._id).toBe(TXID);
    expect(trade.txHash).toBe(WTXID);
    expect(trade.status).toBe('confirmed');
    expect(trade.blockNumber).toBe(1000);
    // createdAt should be preserved from the original pending submission
    expect(trade.createdAt.toISOString()).toBe(pendingCreatedAt.toISOString());
  });

  it('holder balance counted only once when pending→confirmed on same TXID', async () => {
    // Step 1: Save pending trade (isNew=true → holder balance incremented)
    await saveTrade(makeTrade({
      _id: TXID,
      status: 'pending',
      traderAddress: VALID_TRADER_ADDRESS,
      tokenAmount: '10000000',
      createdAt: new Date('2026-01-20T12:00:00Z'),
    }));

    // Step 2: Save confirmed trade with same TXID (isNew=false → holder balance NOT incremented again)
    await saveTrade(makeTrade({
      _id: TXID,
      txHash: WTXID,
      status: 'confirmed',
      traderAddress: VALID_TRADER_ADDRESS,
      tokenAmount: '10000000',
      blockNumber: 1000,
      createdAt: new Date('2026-01-20T12:05:00Z'),
    }));

    // Holder balance should reflect one trade, not two
    const holders = await getTopHolders(VALID_TOKEN_ADDRESS, 10);
    expect(holders.length).toBe(1);
    expect(holders[0].address).toBe(VALID_TRADER_ADDRESS);
    expect(Number(holders[0].balance)).toBe(10000000);

    const count = await getHolderCount(VALID_TOKEN_ADDRESS);
    expect(count).toBe(1);
  });

  it('indexer-first: confirmed trade saved before pending submission still produces one record', async () => {
    // Step 1: Indexer processes block first
    const { isNew: isNew1 } = await saveTrade(makeTrade({
      _id: TXID,
      txHash: WTXID,
      status: 'confirmed',
      traderAddress: VALID_TRADER_ADDRESS,
      blockNumber: 1000,
      createdAt: new Date('2026-01-20T12:05:00Z'),
    }));
    expect(isNew1).toBe(true);

    // Step 2: Frontend submits pending trade after (late arrival)
    const { isNew: isNew2 } = await saveTrade(makeTrade({
      _id: TXID,
      status: 'pending',
      traderAddress: VALID_TRADER_ADDRESS,
      createdAt: new Date('2026-01-20T12:00:00Z'),
    }));
    expect(isNew2).toBe(false);

    // Should still be one record, confirmed status preserved
    const { trades, total } = await listTradesForToken(VALID_TOKEN_ADDRESS, 1, 100);
    expect(total).toBe(1);
    // createdAt should be the indexer's (first save), since that was the original
    expect(trades[0].createdAt.toISOString()).toBe('2026-01-20T12:05:00.000Z');
  });
});

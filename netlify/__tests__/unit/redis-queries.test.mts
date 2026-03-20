import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import {
  saveToken, getToken, listTokens, getTokensByCreator, updateToken, graduateToken,
  saveTrade, listTradesForToken, findAndRemoveOrphanedPendingTrade,
  updateHolderBalance, getTopHolders, getHolderCount,
  getStats, updateStats, getLastBlockIndexed, setLastBlockIndexed,
  acquireIndexerLock, releaseIndexerLock,
} from '../../functions/_shared/redis-queries.mts';
import { makeToken, makeTrade, VALID_TOKEN_ADDRESS, VALID_CREATOR_ADDRESS, VALID_TRADER_ADDRESS } from '../fixtures/index.js';

// ─── Token operations ───────────────────────────────────────────

describe('token operations', () => {
  beforeEach(() => resetMockRedis());

  it('saveToken + getToken roundtrip', async () => {
    const token = makeToken();
    await saveToken(token);

    const fetched = await getToken(VALID_TOKEN_ADDRESS);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('TestToken');
    expect(fetched!.symbol).toBe('TEST');
    expect(fetched!.virtualBtcReserve).toBe('767000');
    expect(fetched!.config.buyTaxBps).toBe(0);
    expect(fetched!.status).toBe('active');
  });

  it('getToken non-existent returns null', async () => {
    const result = await getToken('bc1pnonexistent00000000000000000000000000000');
    expect(result).toBeNull();
  });

  it('listTokens with 3 tokens: pagination', async () => {
    await saveToken(makeToken({ contractAddress: 'addr1', _id: 'addr1', name: 'Token1', deployBlock: 100 }));
    await saveToken(makeToken({ contractAddress: 'addr2', _id: 'addr2', name: 'Token2', deployBlock: 101 }));
    await saveToken(makeToken({ contractAddress: 'addr3', _id: 'addr3', name: 'Token3', deployBlock: 102 }));

    const all = await listTokens({});
    expect(all.tokens.length).toBe(3);
    expect(all.total).toBe(3);

    const page1 = await listTokens({ page: 1, limit: 2 });
    expect(page1.tokens.length).toBe(2);
    expect(page1.total).toBe(3);

    const page2 = await listTokens({ page: 2, limit: 2 });
    expect(page2.tokens.length).toBe(1);
    expect(page2.total).toBe(3);
  });

  it('listTokens with status filter', async () => {
    await saveToken(makeToken({ contractAddress: 'active1', _id: 'active1', name: 'Active1', status: 'active' }));
    await saveToken(makeToken({ contractAddress: 'active2', _id: 'active2', name: 'Active2', status: 'active' }));
    await saveToken(makeToken({ contractAddress: 'grad1', _id: 'grad1', name: 'Grad1', status: 'graduated' }));

    const active = await listTokens({ status: 'active' });
    expect(active.tokens.length).toBe(2);
    expect(active.total).toBe(2);
  });

  it('listTokens with search', async () => {
    await saveToken(makeToken({ contractAddress: 'alpha1', _id: 'alpha1', name: 'AlphaToken', symbol: 'ALPHA' }));
    await saveToken(makeToken({ contractAddress: 'beta1', _id: 'beta1', name: 'BetaToken', symbol: 'BETA' }));

    const result = await listTokens({ search: 'alpha' });
    expect(result.tokens.length).toBe(1);
    expect(result.tokens[0].name).toBe('AlphaToken');
  });

  it('listTokens with sort', async () => {
    await saveToken(makeToken({ contractAddress: 'low', _id: 'low', name: 'LowVol', volume24h: '100' }));
    await saveToken(makeToken({ contractAddress: 'high', _id: 'high', name: 'HighVol', volume24h: '9999' }));

    const result = await listTokens({ sort: 'volume24h', order: 'desc' });
    expect(result.tokens.length).toBe(2);
    expect(result.tokens[0].name).toBe('HighVol');
    expect(result.tokens[1].name).toBe('LowVol');
  });

  it('getTokensByCreator', async () => {
    const creatorA = 'bc1pcreatorA000000000000000000000000000000a';
    const creatorB = 'bc1pcreatorB000000000000000000000000000000a';

    await saveToken(makeToken({ contractAddress: 'tokA1', _id: 'tokA1', creatorAddress: creatorA }));
    await saveToken(makeToken({ contractAddress: 'tokA2', _id: 'tokA2', creatorAddress: creatorA }));
    await saveToken(makeToken({ contractAddress: 'tokB1', _id: 'tokB1', creatorAddress: creatorB }));

    const tokensA = await getTokensByCreator(creatorA);
    expect(tokensA.length).toBe(2);

    const tokensB = await getTokensByCreator(creatorB);
    expect(tokensB.length).toBe(1);
  });

  it('updateToken updates specific fields without changing others', async () => {
    await saveToken(makeToken());

    await updateToken(VALID_TOKEN_ADDRESS, { currentPriceSats: '9999' });

    const fetched = await getToken(VALID_TOKEN_ADDRESS);
    expect(fetched).not.toBeNull();
    expect(fetched!.currentPriceSats).toBe('9999');
    expect(fetched!.name).toBe('TestToken');
  });

  it('graduateToken sets status and graduatedAt', async () => {
    await saveToken(makeToken({ status: 'active' }));

    await graduateToken(VALID_TOKEN_ADDRESS, 200);

    const fetched = await getToken(VALID_TOKEN_ADDRESS);
    expect(fetched).not.toBeNull();
    expect(fetched!.status).toBe('graduated');
    expect(fetched!.graduatedAt).toBe(200);
  });
});

// ─── Trade operations ───────────────────────────────────────────

describe('trade operations', () => {
  beforeEach(() => resetMockRedis());

  it('saveTrade + listTradesForToken roundtrip', async () => {
    const trade = makeTrade();
    await saveTrade(trade);

    const result = await listTradesForToken(VALID_TOKEN_ADDRESS, 1, 10);
    expect(result.trades.length).toBe(1);
    expect(result.total).toBe(1);
    expect(result.trades[0].tokenAmount).toBe(trade.tokenAmount);
  });

  it('saveTrade preserves createdAt on re-save', async () => {
    const date1 = new Date('2026-01-01T00:00:00Z');
    const date2 = new Date('2026-06-15T12:00:00Z');
    const tradeId = 'c'.repeat(64);

    await saveTrade(makeTrade({ _id: tradeId, createdAt: date1 }));
    await saveTrade(makeTrade({ _id: tradeId, createdAt: date2 }));

    const result = await listTradesForToken(VALID_TOKEN_ADDRESS, 1, 10);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0].createdAt.toISOString()).toBe(date1.toISOString());
  });

  it('saveTrade returns isNew correctly', async () => {
    const trade = makeTrade();

    const first = await saveTrade(trade);
    expect(first.isNew).toBe(true);

    const second = await saveTrade(trade);
    expect(second.isNew).toBe(false);
  });

  it('listTradesForToken pagination', async () => {
    await saveTrade(makeTrade({ _id: 'a'.repeat(64), createdAt: new Date('2026-01-01T00:01:00Z') }));
    await saveTrade(makeTrade({ _id: 'b'.repeat(64), createdAt: new Date('2026-01-01T00:02:00Z') }));
    await saveTrade(makeTrade({ _id: 'c'.repeat(64), createdAt: new Date('2026-01-01T00:03:00Z') }));

    const page1 = await listTradesForToken(VALID_TOKEN_ADDRESS, 1, 2);
    expect(page1.trades.length).toBe(2);
    expect(page1.total).toBe(3);

    const page2 = await listTradesForToken(VALID_TOKEN_ADDRESS, 2, 2);
    expect(page2.trades.length).toBe(1);
    expect(page2.total).toBe(3);
  });

  it('findAndRemoveOrphanedPendingTrade removes matching orphan', async () => {
    const orphanHash = 'd'.repeat(64);
    const confirmedHash = 'e'.repeat(64);

    await saveTrade(makeTrade({
      _id: orphanHash,
      status: 'pending',
      type: 'buy',
      tokenAmount: '5000',
      tokenAddress: VALID_TOKEN_ADDRESS,
      traderAddress: VALID_TRADER_ADDRESS,
    }));

    const result = await findAndRemoveOrphanedPendingTrade(
      confirmedHash,
      VALID_TOKEN_ADDRESS,
      'buy',
      '5000',
    );

    expect(result).toBe(orphanHash);

    // Verify orphan is deleted
    const trades = await listTradesForToken(VALID_TOKEN_ADDRESS, 1, 10);
    expect(trades.trades.length).toBe(0);
  });

  it('findAndRemoveOrphanedPendingTrade returns null when no match', async () => {
    const result = await findAndRemoveOrphanedPendingTrade(
      'f'.repeat(64),
      VALID_TOKEN_ADDRESS,
      'buy',
      '5000',
    );
    expect(result).toBeNull();
  });
});

// ─── Holder tracking ────────────────────────────────────────────

describe('holder tracking', () => {
  beforeEach(() => resetMockRedis());

  it('updateHolderBalance buy adds holder with correct balance', async () => {
    await updateHolderBalance(VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS, '1000000', 'buy');

    const holders = await getTopHolders(VALID_TOKEN_ADDRESS);
    expect(holders.length).toBe(1);
    expect(holders[0].address).toBe(VALID_TRADER_ADDRESS);
    expect(holders[0].balance).toBe('1000000');
  });

  it('updateHolderBalance sell to zero removes holder', async () => {
    await updateHolderBalance(VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS, '1000000', 'buy');
    await updateHolderBalance(VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS, '1000000', 'sell');

    const holders = await getTopHolders(VALID_TOKEN_ADDRESS);
    expect(holders.length).toBe(0);
  });

  it('getHolderCount returns correct count', async () => {
    const trader2 = 'bc1ptesttrader2000000000000000000000000000a';

    await updateHolderBalance(VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS, '500', 'buy');
    await updateHolderBalance(VALID_TOKEN_ADDRESS, trader2, '300', 'buy');

    const count = await getHolderCount(VALID_TOKEN_ADDRESS);
    expect(count).toBe(2);
  });
});

// ─── Stats & indexer ────────────────────────────────────────────

describe('stats & indexer', () => {
  beforeEach(() => resetMockRedis());

  it('getStats returns zeros by default', async () => {
    const stats = await getStats();
    expect(stats.totalTokens).toBe(0);
    expect(stats.totalGraduated).toBe(0);
    expect(stats.totalVolumeSats).toBe('0');
    expect(stats.totalTrades).toBe(0);
    expect(stats.lastBlockIndexed).toBe(0);
  });

  it('updateStats + getStats roundtrip', async () => {
    await updateStats({ totalTokens: 5, totalTrades: 42, totalVolumeSats: '123456789' });

    const stats = await getStats();
    expect(stats.totalTokens).toBe(5);
    expect(stats.totalTrades).toBe(42);
    expect(stats.totalVolumeSats).toBe('123456789');
  });

  it('get/setLastBlockIndexed roundtrip', async () => {
    expect(await getLastBlockIndexed()).toBe(0);

    await setLastBlockIndexed(500);
    expect(await getLastBlockIndexed()).toBe(500);
  });

  it('acquireIndexerLock succeeds first time', async () => {
    const acquired = await acquireIndexerLock();
    expect(acquired).toBe(true);
  });

  it('acquireIndexerLock fails second time', async () => {
    await acquireIndexerLock();
    const second = await acquireIndexerLock();
    expect(second).toBe(false);
  });

  it('releaseIndexerLock then acquireIndexerLock succeeds again', async () => {
    await acquireIndexerLock();
    await releaseIndexerLock();

    const acquired = await acquireIndexerLock();
    expect(acquired).toBe(true);
  });
});

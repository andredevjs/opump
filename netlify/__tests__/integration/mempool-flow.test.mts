/**
 * End-to-end mempool-first lifecycle test.
 * Validates the core architectural principle: trades appear instantly,
 * indexer confirms later, original timestamps preserved.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { saveToken, saveTrade, getToken, getOHLCV } from '../../functions/_shared/redis-queries.mts';
import { makeToken, VALID_TOKEN_ADDRESS, VALID_TRADER_ADDRESS, VALID_TX_HASH } from '../fixtures/index.js';

function postTrade(body: unknown): Request {
  return new Request('http://localhost/api/v1/trades', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('mempool-first E2E flow', () => {
  beforeEach(async () => {
    resetMockRedis();
    // Step 1: Seed token with initial reserves
    await saveToken(makeToken());
  });

  it('full lifecycle: submit → visible → confirm → consistent', async () => {
    const tradeBody = {
      txHash: VALID_TX_HASH,
      tokenAddress: VALID_TOKEN_ADDRESS,
      type: 'buy',
      traderAddress: VALID_TRADER_ADDRESS,
      btcAmount: '100000',
      tokenAmount: '11403990276138280',
      pricePerToken: '8770',
    };

    // Step 2: Submit buy trade (mempool)
    const submitHandler = (await import('../../functions/trades-submit.mts')).default;
    const submitRes = await submitHandler(postTrade(tradeBody), {} as any);
    expect(submitRes.status).toBe(200);

    // Step 3: Verify trade appears in trade list with status=pending
    const tradesHandler = (await import('../../functions/tokens-trades.mts')).default;
    const tradesReq = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/trades`);
    const tradesRes = await tradesHandler(tradesReq, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    const tradesBody = await tradesRes.json() as any;
    expect(tradesBody.trades.length).toBe(1);
    expect(tradesBody.trades[0].status).toBe('pending');
    const originalCreatedAt = tradesBody.trades[0].createdAt;

    // Step 4: Verify token price updated via tokens-price
    const priceHandler = (await import('../../functions/tokens-price.mts')).default;
    const priceReq = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/price`);
    const priceRes = await priceHandler(priceReq, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    const priceBody = await priceRes.json() as any;
    expect(priceBody.currentPriceSats).toBe('8770');

    // Step 5: Verify OHLCV candle created
    const ohlcvHandler = (await import('../../functions/tokens-ohlcv.mts')).default;
    const ohlcvReq = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/ohlcv?timeframe=1m`);
    const ohlcvRes = await ohlcvHandler(ohlcvReq, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    const ohlcvBody = await ohlcvRes.json() as any;
    expect(ohlcvBody.candles.length).toBeGreaterThan(0);

    // Step 6: Verify holder appears in holders-list
    const holdersHandler = (await import('../../functions/holders-list.mts')).default;
    const holdersReq = new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/holders`);
    const holdersRes = await holdersHandler(holdersReq, { params: { address: VALID_TOKEN_ADDRESS } } as any);
    const holdersBody = await holdersRes.json() as any;
    expect(holdersBody.holders.length).toBeGreaterThan(0);
    expect(holdersBody.holders[0].address).toBe(VALID_TRADER_ADDRESS);

    // Step 7: Simulate indexer confirmation (save same trade as confirmed)
    await saveTrade({
      _id: VALID_TX_HASH,
      tokenAddress: VALID_TOKEN_ADDRESS,
      type: 'buy',
      traderAddress: VALID_TRADER_ADDRESS,
      btcAmount: '100000',
      tokenAmount: '11403990276138280',
      pricePerToken: '8770',
      fees: { platform: '1000', creator: '250', flywheel: '0' },
      priceImpactBps: 1287,
      status: 'confirmed',
      blockNumber: 101,
      createdAt: new Date(), // indexer passes current time, but saveTrade preserves original
    });

    // Step 8: Verify createdAt preserved (mempool-first rule)
    const tradesRes2 = await tradesHandler(
      new Request(`http://localhost/api/v1/tokens/${VALID_TOKEN_ADDRESS}/trades`),
      { params: { address: VALID_TOKEN_ADDRESS } } as any,
    );
    const tradesBody2 = await tradesRes2.json() as any;
    expect(tradesBody2.trades[0].createdAt).toBe(originalCreatedAt);
    expect(tradesBody2.trades[0].status).toBe('confirmed');

    // Step 9: Verify data consistency
    const token = await getToken(VALID_TOKEN_ADDRESS);
    expect(token).not.toBeNull();
    expect(token!.tradeCount).toBeGreaterThanOrEqual(1);
    expect(BigInt(token!.volume24h)).toBeGreaterThan(0n);
  });
});

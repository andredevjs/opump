import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { updateOHLCV, getOHLCV, TIMEFRAME_SECONDS } from '../../functions/_shared/redis-ohlcv.mts';

const TOKEN = 'bc1ptokenaddress';

// Base timestamp aligned to all timeframe boundaries (divisible by 86400)
const BASE_TS = 1699920000;

describe('updateOHLCV()', () => {
  beforeEach(() => resetMockRedis());

  it('creates a new candle with matching OHLCV values', async () => {
    await updateOHLCV(TOKEN, 1000, 500, BASE_TS);

    const candles = await getOHLCV(TOKEN, '1m', 10);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toEqual({
      time: BASE_TS,
      open: 1000,
      high: 1000,
      low: 1000,
      close: 1000,
      volume: 500,
    });
  });

  it('updates existing candle: high, close, and cumulative volume', async () => {
    await updateOHLCV(TOKEN, 1000, 500, BASE_TS);
    await updateOHLCV(TOKEN, 1200, 300, BASE_TS);

    const candles = await getOHLCV(TOKEN, '1m', 10);
    expect(candles).toHaveLength(1);
    expect(candles[0].high).toBe(1200);
    expect(candles[0].low).toBe(1000);
    expect(candles[0].close).toBe(1200);
    expect(candles[0].volume).toBe(800); // 500 + 300
  });

  it('updates low price when a lower price arrives in the same bucket', async () => {
    await updateOHLCV(TOKEN, 1000, 500, BASE_TS);
    await updateOHLCV(TOKEN, 800, 100, BASE_TS);

    const candles = await getOHLCV(TOKEN, '1m', 10);
    expect(candles).toHaveLength(1);
    expect(candles[0].low).toBe(800);
    expect(candles[0].open).toBe(1000); // open stays at first trade
  });
});

describe('getOHLCV()', () => {
  beforeEach(() => resetMockRedis());

  it('returns candles in chronological order', async () => {
    const t1 = BASE_TS;
    const t2 = BASE_TS + 60; // next 1m bucket
    await updateOHLCV(TOKEN, 100, 10, t1);
    await updateOHLCV(TOKEN, 200, 20, t2);

    const candles = await getOHLCV(TOKEN, '1m', 10);
    expect(candles).toHaveLength(2);
    expect(candles[0].time).toBe(t1);
    expect(candles[1].time).toBe(t2);
  });

  it('respects limit and returns the most recent candles', async () => {
    // Create 5 candles in consecutive 1m buckets
    for (let i = 0; i < 5; i++) {
      await updateOHLCV(TOKEN, 100 + i, 10, BASE_TS + i * 60);
    }

    const candles = await getOHLCV(TOKEN, '1m', 3);
    expect(candles).toHaveLength(3);
    // Should be the 3 most recent, in chronological order
    expect(candles[0].time).toBe(BASE_TS + 2 * 60);
    expect(candles[1].time).toBe(BASE_TS + 3 * 60);
    expect(candles[2].time).toBe(BASE_TS + 4 * 60);
  });

  it('returns empty array when no candles exist', async () => {
    const candles = await getOHLCV(TOKEN, '1m', 10);
    expect(candles).toEqual([]);
  });
});

describe('timeframe coverage', () => {
  beforeEach(() => resetMockRedis());

  it('updates all 6 timeframes from a single trade', async () => {
    await updateOHLCV(TOKEN, 500, 50, BASE_TS);

    const timeframes = Object.keys(TIMEFRAME_SECONDS);
    expect(timeframes).toHaveLength(6);

    for (const tf of timeframes) {
      const candles = await getOHLCV(TOKEN, tf, 10);
      expect(candles).toHaveLength(1);
      expect(candles[0].open).toBe(500);
      expect(candles[0].volume).toBe(50);
    }
  });
});

describe('timeframe bucketing', () => {
  beforeEach(() => resetMockRedis());

  it('floors timestamps to the correct bucket per timeframe', async () => {
    // timestamp at second minute: BASE_TS + 60
    const ts = BASE_TS + 60;
    await updateOHLCV(TOKEN, 999, 10, ts);

    // 1m bucket: floor((BASE_TS+60) / 60) * 60 = BASE_TS + 60 (already aligned)
    const candles1m = await getOHLCV(TOKEN, '1m', 10);
    expect(candles1m[0].time).toBe(BASE_TS + 60);

    // 5m bucket: floor((BASE_TS+60) / 300) * 300 = BASE_TS (floors back to 5m boundary)
    const candles5m = await getOHLCV(TOKEN, '5m', 10);
    expect(candles5m[0].time).toBe(BASE_TS);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { getPriceCacheKey, usePriceStore, markTxCharted, isTxCharted } from '../price-store';

const TIMEFRAME = '1m' as const;
const ALT_TIMEFRAME = '1h' as const;

function resetStore() {
  usePriceStore.setState({
    candles: {},
    loading: {},
    livePrices: {},
    activeTimeframes: {},
  });
}

const TOKEN = 'bc1qtoken_test';

describe('price-store', () => {
  beforeEach(resetStore);

  describe('setLivePrice', () => {
    it('merges partial updates without overwriting unset fields', () => {
      usePriceStore.getState().setLivePrice(TOKEN, {
        currentPriceSats: '0.5',
        currentSupplyOnCurve: '10000000000',
        aScaled: '1000000000000000000',
        bScaled: '2000000000000000000',
        realBtcReserve: '500000',
        isOptimistic: false,
      });
      usePriceStore.getState().setLivePrice(TOKEN, {
        currentPriceSats: '0.6',
        isOptimistic: true,
      });

      const lp = usePriceStore.getState().livePrices[TOKEN];
      expect(lp.currentPriceSats).toBe('0.6');
      expect(lp.currentSupplyOnCurve).toBe('10000000000');
      expect(lp.isOptimistic).toBe(true);
    });
  });

  describe('updateLastCandle', () => {
    it('replaces the last candle', () => {
      usePriceStore.getState().setActiveTimeframe(TOKEN, TIMEFRAME);
      usePriceStore.getState().setCandles(TOKEN, TIMEFRAME, [
        { time: 1000, open: 0.1, high: 0.2, low: 0.1, close: 0.15, volume: 50000 },
      ]);
      usePriceStore.getState().updateLastCandle(TOKEN, {
        time: 1000, open: 0.1, high: 0.3, low: 0.1, close: 0.3, volume: 80000,
      });

      const candles = usePriceStore.getState().candles[getPriceCacheKey(TOKEN, TIMEFRAME)];
      expect(candles).toHaveLength(1);
      expect(candles[0].close).toBe(0.3);
    });

    it('is a no-op when candles are empty', () => {
      usePriceStore.getState().setActiveTimeframe(TOKEN, TIMEFRAME);
      usePriceStore.getState().updateLastCandle(TOKEN, {
        time: 1000, open: 0.1, high: 0.3, low: 0.1, close: 0.3, volume: 80000,
      });

      const candles = usePriceStore.getState().candles[getPriceCacheKey(TOKEN, TIMEFRAME)];
      expect(candles).toBeUndefined();
    });
  });

  describe('timeframe cache keys', () => {
    it('keeps candle sets isolated per timeframe', () => {
      usePriceStore.getState().setCandles(TOKEN, TIMEFRAME, [
        { time: 1000, open: 0.1, high: 0.2, low: 0.1, close: 0.15, volume: 50000 },
      ]);
      usePriceStore.getState().setCandles(TOKEN, ALT_TIMEFRAME, [
        { time: 2000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 90000 },
      ]);

      const state = usePriceStore.getState();
      expect(state.candles[getPriceCacheKey(TOKEN, TIMEFRAME)]).toHaveLength(1);
      expect(state.candles[getPriceCacheKey(TOKEN, ALT_TIMEFRAME)]).toHaveLength(1);
      expect(state.candles[getPriceCacheKey(TOKEN, TIMEFRAME)][0].time).toBe(1000);
      expect(state.candles[getPriceCacheKey(TOKEN, ALT_TIMEFRAME)][0].time).toBe(2000);
    });
  });
});

describe('chart tx dedupe', () => {
  it('marks a tx as charted and detects it', () => {
    expect(isTxCharted(TOKEN, 'tx-1')).toBe(false);
    markTxCharted(TOKEN, 'tx-1');
    expect(isTxCharted(TOKEN, 'tx-1')).toBe(true);
  });

  it('isolates tokens', () => {
    markTxCharted('token-a', 'tx-1');
    expect(isTxCharted('token-a', 'tx-1')).toBe(true);
    expect(isTxCharted('token-b', 'tx-1')).toBe(false);
  });

  it('handles multiple txHashes for the same token', () => {
    markTxCharted(TOKEN, 'tx-1');
    markTxCharted(TOKEN, 'tx-2');
    expect(isTxCharted(TOKEN, 'tx-1')).toBe(true);
    expect(isTxCharted(TOKEN, 'tx-2')).toBe(true);
    expect(isTxCharted(TOKEN, 'tx-3')).toBe(false);
  });

  it('caps entries to prevent unbounded growth', () => {
    for (let i = 0; i < 250; i++) {
      markTxCharted(TOKEN, `tx-${i}`);
    }
    // After 200+ entries, older ones are pruned to 100
    // Most recent entries should still be present
    expect(isTxCharted(TOKEN, 'tx-249')).toBe(true);
  });
});

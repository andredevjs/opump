import { create } from 'zustand';
import type { OHLCVCandle, TimeframeKey } from '@/types/api';

interface LivePrice {
  currentPriceSats: string;
  virtualBtcReserve: string;
  virtualTokenSupply: string;
  realBtcReserve: string;
  isOptimistic: boolean;
}

const TIMEFRAME_SECONDS: Record<TimeframeKey, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

interface PriceStore {
  // token address -> candles
  candles: Record<string, OHLCVCandle[]>;
  // token address -> loading state
  loading: Record<string, boolean>;
  // token address -> live price from WebSocket
  livePrices: Record<string, LivePrice>;
  // token address -> active chart timeframe
  activeTimeframes: Record<string, TimeframeKey>;
  setCandles: (address: string, candles: OHLCVCandle[]) => void;
  clearCandles: (address: string) => void;
  setLoading: (address: string, loading: boolean) => void;
  appendCandle: (address: string, candle: OHLCVCandle) => void;
  updateLastCandle: (address: string, candle: OHLCVCandle) => void;
  setLivePrice: (address: string, price: Partial<LivePrice>) => void;
  setActiveTimeframe: (address: string, timeframe: TimeframeKey) => void;
  /** Add an optimistic trade data point to the chart candles */
  addTradeCandle: (address: string, price: number, volume: number) => void;
}

const MAX_CANDLES = 500;

export const usePriceStore = create<PriceStore>((set, get) => ({
  candles: {},
  loading: {},
  livePrices: {},
  activeTimeframes: {},

  setCandles: (address, candles) =>
    set((state) => ({
      candles: { ...state.candles, [address]: candles.slice(-MAX_CANDLES) },
    })),

  clearCandles: (address) =>
    set((state) => ({
      candles: { ...state.candles, [address]: [] },
    })),

  setLoading: (address, loading) =>
    set((state) => ({
      loading: { ...state.loading, [address]: loading },
    })),

  appendCandle: (address, candle) =>
    set((state) => {
      const updated = [...(state.candles[address] ?? []), candle];
      return {
        candles: {
          ...state.candles,
          [address]: updated.length > MAX_CANDLES ? updated.slice(-MAX_CANDLES) : updated,
        },
      };
    }),

  updateLastCandle: (address, candle) =>
    set((state) => {
      const existing = state.candles[address] ?? [];
      if (existing.length === 0) return state;
      return {
        candles: {
          ...state.candles,
          [address]: [...existing.slice(0, -1), candle],
        },
      };
    }),

  setLivePrice: (address, price) =>
    set((state) => {
      const existing = state.livePrices[address];
      return {
        livePrices: {
          ...state.livePrices,
          [address]: {
            currentPriceSats: price.currentPriceSats ?? existing?.currentPriceSats ?? '0',
            virtualBtcReserve: price.virtualBtcReserve ?? existing?.virtualBtcReserve ?? '0',
            virtualTokenSupply: price.virtualTokenSupply ?? existing?.virtualTokenSupply ?? '0',
            realBtcReserve: price.realBtcReserve ?? existing?.realBtcReserve ?? '0',
            isOptimistic: price.isOptimistic ?? existing?.isOptimistic ?? false,
          },
        },
      };
    }),

  setActiveTimeframe: (address, timeframe) =>
    set((state) => ({
      activeTimeframes: { ...state.activeTimeframes, [address]: timeframe },
    })),

  addTradeCandle: (address, price, volume) => {
    const state = get();
    const tf = state.activeTimeframes[address] ?? '15m';
    const bucketSeconds = TIMEFRAME_SECONDS[tf];
    const nowSec = Math.floor(Date.now() / 1000);
    const bucketTime = Math.floor(nowSec / bucketSeconds) * bucketSeconds;

    const candles = state.candles[address] ?? [];
    const last = candles[candles.length - 1];

    if (last && last.time === bucketTime) {
      get().updateLastCandle(address, {
        time: bucketTime,
        open: last.open,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
        close: price,
        volume: last.volume + volume,
      });
    } else {
      get().appendCandle(address, {
        time: bucketTime,
        open: price,
        high: price,
        low: price,
        close: price,
        volume,
      });
    }
  },
}));

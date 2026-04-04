import { create } from 'zustand';
import type { OHLCVCandle, TimeframeKey } from '@/types/api';

export type ChartType = 'line' | 'candlestick';
export function getPriceCacheKey(address: string, timeframe: TimeframeKey): string {
  return `${address}:${timeframe}`;
}

const CHART_TYPE_KEY = 'opump-chart-type';
const storedChartType = (typeof window !== 'undefined'
  ? sessionStorage.getItem(CHART_TYPE_KEY)
  : null) as ChartType | null;

interface LivePrice {
  currentPriceSats: string;
  currentSupplyOnCurve: string;
  aScaled: string;
  bScaled: string;
  realBtcReserve: string;
  isOptimistic: boolean;
}

interface PriceStore {
  // token address + timeframe -> candles
  candles: Record<string, OHLCVCandle[]>;
  // token address + timeframe -> loading state
  loading: Record<string, boolean>;
  // token address -> live price from polling
  livePrices: Record<string, LivePrice>;
  // token address -> active chart timeframe
  activeTimeframes: Record<string, TimeframeKey>;
  // chart type preference (line or candlestick)
  chartType: ChartType;
  setCandles: (address: string, timeframe: TimeframeKey, candles: OHLCVCandle[]) => void;
  setLoading: (address: string, timeframe: TimeframeKey, loading: boolean) => void;
  updateLastCandle: (address: string, candle: OHLCVCandle) => void;
  setLivePrice: (address: string, price: Partial<LivePrice>) => void;
  setActiveTimeframe: (address: string, timeframe: TimeframeKey) => void;
  setChartType: (type: ChartType) => void;
}

const MAX_CANDLES = 500;

export const usePriceStore = create<PriceStore>((set) => ({
  candles: {},
  loading: {},
  livePrices: {},
  activeTimeframes: {},
  chartType: storedChartType === 'line' ? 'line' : 'candlestick',

  setCandles: (address, timeframe, candles) =>
    set((state) => ({
      candles: {
        ...state.candles,
        [getPriceCacheKey(address, timeframe)]: candles.slice(-MAX_CANDLES),
      },
    })),

  setLoading: (address, timeframe, loading) =>
    set((state) => ({
      loading: { ...state.loading, [getPriceCacheKey(address, timeframe)]: loading },
    })),

  updateLastCandle: (address, candle) =>
    set((state) => {
      const timeframe = state.activeTimeframes[address];
      if (!timeframe) return state;
      const key = getPriceCacheKey(address, timeframe);
      const existing = state.candles[key] ?? [];
      if (existing.length === 0) return state;
      return {
        candles: {
          ...state.candles,
          [key]: [...existing.slice(0, -1), candle],
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
            currentSupplyOnCurve: price.currentSupplyOnCurve ?? existing?.currentSupplyOnCurve ?? '0',
            aScaled: price.aScaled ?? existing?.aScaled ?? '0',
            bScaled: price.bScaled ?? existing?.bScaled ?? '0',
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

  setChartType: (type) => {
    sessionStorage.setItem(CHART_TYPE_KEY, type);
    set({ chartType: type });
  },
}));

const _chartedTxHashes: Record<string, Set<string>> = {};

export function markTxCharted(address: string, txHash: string): void {
  if (!_chartedTxHashes[address]) _chartedTxHashes[address] = new Set();
  _chartedTxHashes[address].add(txHash);
  if (_chartedTxHashes[address].size > 200) {
    const entries = [..._chartedTxHashes[address]];
    _chartedTxHashes[address] = new Set(entries.slice(-100));
  }
}

export function isTxCharted(address: string, txHash: string): boolean {
  return _chartedTxHashes[address]?.has(txHash) ?? false;
}

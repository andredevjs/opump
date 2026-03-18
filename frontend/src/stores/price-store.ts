import { create } from 'zustand';
import type { OHLCVCandle, TimeframeKey } from '@/types/api';

interface LivePrice {
  currentPriceSats: string;
  virtualBtcReserve: string;
  virtualTokenSupply: string;
  realBtcReserve: string;
  isOptimistic: boolean;
}

interface PriceStore {
  // token address -> candles
  candles: Record<string, OHLCVCandle[]>;
  // token address -> loading state
  loading: Record<string, boolean>;
  // token address -> live price from polling
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
}

const MAX_CANDLES = 500;

export const usePriceStore = create<PriceStore>((set) => ({
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

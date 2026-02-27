import { create } from 'zustand';
import type { OHLCVCandle } from '@/types/api';

interface PriceStore {
  // token address -> candles
  candles: Record<string, OHLCVCandle[]>;
  setCandles: (address: string, candles: OHLCVCandle[]) => void;
  appendCandle: (address: string, candle: OHLCVCandle) => void;
  updateLastCandle: (address: string, candle: OHLCVCandle) => void;
}

export const usePriceStore = create<PriceStore>((set) => ({
  candles: {},

  setCandles: (address, candles) =>
    set((state) => ({
      candles: { ...state.candles, [address]: candles },
    })),

  appendCandle: (address, candle) =>
    set((state) => ({
      candles: {
        ...state.candles,
        [address]: [...(state.candles[address] ?? []), candle],
      },
    })),

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
}));

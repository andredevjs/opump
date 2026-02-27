import { create } from 'zustand';
import type { PendingTransaction } from '@/types/trade';

interface TradeStore {
  pendingTransactions: PendingTransaction[];
  // Token holdings: address -> token-units
  holdings: Record<string, number>;
  addPending: (tx: PendingTransaction) => void;
  updatePendingStatus: (id: string, status: PendingTransaction['status']) => void;
  removePending: (id: string) => void;
  addHolding: (tokenAddress: string, units: number) => void;
  removeHolding: (tokenAddress: string, units: number) => void;
  getHolding: (tokenAddress: string) => number;
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  pendingTransactions: [],
  holdings: {},

  addPending: (tx) =>
    set((state) => ({
      pendingTransactions: [tx, ...state.pendingTransactions],
    })),

  updatePendingStatus: (id, status) =>
    set((state) => ({
      pendingTransactions: state.pendingTransactions.map((tx) =>
        tx.id === id ? { ...tx, status } : tx,
      ),
    })),

  removePending: (id) =>
    set((state) => ({
      pendingTransactions: state.pendingTransactions.filter((tx) => tx.id !== id),
    })),

  addHolding: (tokenAddress, units) =>
    set((state) => ({
      holdings: {
        ...state.holdings,
        [tokenAddress]: (state.holdings[tokenAddress] ?? 0) + units,
      },
    })),

  removeHolding: (tokenAddress, units) =>
    set((state) => ({
      holdings: {
        ...state.holdings,
        [tokenAddress]: Math.max(0, (state.holdings[tokenAddress] ?? 0) - units),
      },
    })),

  getHolding: (tokenAddress) => get().holdings[tokenAddress] ?? 0,
}));

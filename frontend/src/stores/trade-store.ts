import { create } from 'zustand';
import BigNumber from 'bignumber.js';
import type { PendingTransaction } from '@/types/trade';

const KNOWN_TOKENS_KEY = 'opump:known-token-addresses';

function loadKnownAddresses(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_TOKENS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function saveKnownAddress(address: string): void {
  const known = new Set(loadKnownAddresses());
  known.add(address);
  localStorage.setItem(KNOWN_TOKENS_KEY, JSON.stringify([...known]));
}

export function getKnownTokenAddresses(): string[] {
  return loadKnownAddresses();
}

interface WsTrade {
  txHash: string;
  type: 'buy' | 'sell';
  traderAddress: string;
  btcAmount: string;
  tokenAmount: string;
  status: string;
  pricePerToken: string;
}

interface TradeStore {
  pendingTransactions: PendingTransaction[];
  // Token holdings: address -> token-units (string to avoid precision loss)
  holdings: Record<string, string>;
  // Recent WS trades per token (for live feed)
  recentTrades: Record<string, WsTrade[]>;
  addPending: (tx: PendingTransaction) => void;
  updatePendingStatus: (id: string, status: PendingTransaction['status']) => void;
  removePending: (id: string) => void;
  setHolding: (tokenAddress: string, units: string) => void;
  addHolding: (tokenAddress: string, units: string) => void;
  removeHolding: (tokenAddress: string, units: string) => void;
  getHolding: (tokenAddress: string) => string;
  addWsTrade: (tokenAddress: string, trade: WsTrade) => void;
  confirmWsTrade: (tokenAddress: string, txHash: string) => void;
  dropWsTrade: (tokenAddress: string, txHash: string) => void;
}

export const useTradeStore = create<TradeStore>((set, get) => ({
  pendingTransactions: [],
  holdings: {},
  recentTrades: {},

  addPending: (tx) =>
    set((state) => ({
      pendingTransactions: [tx, ...state.pendingTransactions].slice(0, 100),
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

  setHolding: (tokenAddress, units) => {
    saveKnownAddress(tokenAddress);
    set((state) => ({
      holdings: {
        ...state.holdings,
        [tokenAddress]: units,
      },
    }));
  },

  addHolding: (tokenAddress, units) => {
    const bn = new BigNumber(units);
    if (bn.isNaN() || !bn.isFinite()) return;
    saveKnownAddress(tokenAddress);
    set((state) => {
      const current = new BigNumber(state.holdings[tokenAddress] ?? '0');
      return {
        holdings: {
          ...state.holdings,
          [tokenAddress]: current.plus(bn).toFixed(0),
        },
      };
    });
  },

  removeHolding: (tokenAddress, units) => {
    const bn = new BigNumber(units);
    if (bn.isNaN() || !bn.isFinite()) return;
    set((state) => {
      const current = new BigNumber(state.holdings[tokenAddress] ?? '0');
      return {
        holdings: {
          ...state.holdings,
          [tokenAddress]: BigNumber.max(0, current.minus(bn)).toFixed(0),
        },
      };
    });
  },

  getHolding: (tokenAddress) => get().holdings[tokenAddress] ?? '0',

  addWsTrade: (tokenAddress, trade) =>
    set((state) => {
      const existing = state.recentTrades[tokenAddress] ?? [];
      const dupeIndex = existing.findIndex((t) => t.txHash === trade.txHash);
      if (dupeIndex !== -1) {
        const updated = [...existing];
        updated[dupeIndex] = { ...updated[dupeIndex], ...trade };
        return { recentTrades: { ...state.recentTrades, [tokenAddress]: updated } };
      }
      return {
        recentTrades: {
          ...state.recentTrades,
          [tokenAddress]: [trade, ...existing].slice(0, 50),
        },
      };
    }),

  confirmWsTrade: (tokenAddress, txHash) =>
    set((state) => {
      const existing = state.recentTrades[tokenAddress] ?? [];
      return {
        recentTrades: {
          ...state.recentTrades,
          [tokenAddress]: existing.map((t) =>
            t.txHash === txHash ? { ...t, status: 'confirmed' } : t,
          ),
        },
      };
    }),

  dropWsTrade: (tokenAddress, txHash) =>
    set((state) => {
      const existing = state.recentTrades[tokenAddress] ?? [];
      return {
        recentTrades: {
          ...state.recentTrades,
          [tokenAddress]: existing.filter((t) => t.txHash !== txHash),
        },
      };
    }),
}));

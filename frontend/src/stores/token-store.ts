import { create } from 'zustand';
import type { Token, TokenFilter } from '@/types/token';
import * as api from '@/services/api';
import { mapApiTokenToToken } from '@/lib/mappers';

interface TokenStats {
  volume24hSats?: number;
  marketCapSats?: number;
  tradeCount24h?: number;
  holderCount?: number;
  graduationProgress?: number;
  realBtcReserve?: string;
}

interface TokenStore {
  tokens: Token[];
  selectedToken: Token | null;
  filter: TokenFilter;
  loading: boolean;
  error: string | null;
  pagination: { page: number; totalPages: number; total: number };
  setSelectedToken: (token: Token | null) => void;
  setFilter: (filter: Partial<TokenFilter>) => void;
  updateTokenPrice: (address: string, priceSats: number, change24h: number) => void;
  updateTokenStats: (address: string, stats: TokenStats) => void;
  getToken: (address: string) => Token | undefined;
  fetchTokens: () => Promise<void>;
  fetchToken: (address: string) => Promise<Token | null>;
}

export const useTokenStore = create<TokenStore>((set, get) => {
  // W18: Internal mutable state — not exposed to subscribers
  let _fetchGeneration = 0;

  return ({
  tokens: [],
  selectedToken: null,
  filter: { search: '', status: 'all', sort: 'volume' },
  loading: false,
  error: null,
  pagination: { page: 1, totalPages: 1, total: 0 },

  setSelectedToken: (token) => set({ selectedToken: token }),

  setFilter: (partial) => {
    set((state) => ({
      filter: { ...state.filter, ...partial },
    }));
    get().fetchTokens();
  },

  updateTokenPrice: (address, priceSats, change24h) =>
    set((state) => ({
      tokens: state.tokens.map((t) =>
        t.address === address
          ? { ...t, currentPriceSats: priceSats, priceChange24h: change24h }
          : t,
      ),
      selectedToken:
        state.selectedToken?.address === address
          ? { ...state.selectedToken, currentPriceSats: priceSats, priceChange24h: change24h }
          : state.selectedToken,
    })),

  updateTokenStats: (address, stats) =>
    set((state) => {
      const patch: Partial<Token> = {};
      if (stats.volume24hSats != null) patch.volume24hSats = stats.volume24hSats;
      if (stats.marketCapSats != null) patch.marketCapSats = stats.marketCapSats;
      if (stats.tradeCount24h != null) patch.tradeCount24h = stats.tradeCount24h;
      if (stats.holderCount != null) patch.holderCount = stats.holderCount;
      if (stats.graduationProgress != null) patch.graduationProgress = stats.graduationProgress;
      if (stats.realBtcReserve != null) patch.realBtcReserve = stats.realBtcReserve;

      return {
        tokens: state.tokens.map((t) =>
          t.address === address ? { ...t, ...patch } : t,
        ),
        selectedToken:
          state.selectedToken?.address === address
            ? { ...state.selectedToken, ...patch }
            : state.selectedToken,
      };
    }),

  getToken: (address) => get().tokens.find((t) => t.address === address),

  fetchTokens: async () => {
    const gen = ++_fetchGeneration;
    set({ loading: true, error: null });
    try {
      const { filter } = get();
      const sortMap: Record<string, 'volume24h' | 'marketCap' | 'price' | 'newest'> = {
        volume: 'volume24h',
        marketCap: 'marketCap',
        price: 'price',
        newest: 'newest',
      };

      const result = await api.getTokens({
        search: filter.search || undefined,
        status: filter.status === 'all' ? undefined : filter.status,
        sort: sortMap[filter.sort] || 'volume24h',
        order: 'desc',
      });

      // Discard stale response from a superseded fetch
      if (gen !== _fetchGeneration) return;

      const tokens: Token[] = result.tokens.map(mapApiTokenToToken);

      set({
        tokens,
        loading: false,
        pagination: {
          page: result.pagination.page,
          totalPages: result.pagination.totalPages,
          total: result.pagination.total,
        },
      });
    } catch (err) {
      if (gen !== _fetchGeneration) return;
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch tokens',
      });
    }
  },

  // W11: Set loading state during fetchToken
  fetchToken: async (address) => {
    set({ loading: true });
    try {
      const t = await api.getToken(address);
      const token = mapApiTokenToToken(t);
      set({ selectedToken: token, loading: false });
      return token;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch token';
      set({ error: message, loading: false });
      return null;
    }
  },
});
});

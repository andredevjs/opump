import { create } from 'zustand';
import type { Token, TokenFilter } from '@/types/token';
import { MOCK_TOKENS } from '@/mock/tokens';

interface TokenStore {
  tokens: Token[];
  selectedToken: Token | null;
  filter: TokenFilter;
  loading: boolean;
  setSelectedToken: (token: Token | null) => void;
  setFilter: (filter: Partial<TokenFilter>) => void;
  updateTokenPrice: (address: string, priceSats: number, change24h: number) => void;
  getToken: (address: string) => Token | undefined;
}

export const useTokenStore = create<TokenStore>((set, get) => ({
  tokens: MOCK_TOKENS,
  selectedToken: null,
  filter: { search: '', status: 'all', sort: 'volume' },
  loading: false,

  setSelectedToken: (token) => set({ selectedToken: token }),

  setFilter: (partial) =>
    set((state) => ({
      filter: { ...state.filter, ...partial },
    })),

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

  getToken: (address) => get().tokens.find((t) => t.address === address),
}));

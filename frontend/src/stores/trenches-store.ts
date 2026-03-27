import { create } from 'zustand';
import type { Token } from '@/types/token';
import * as api from '@/services/api';
import { mapApiTokenToToken } from '@/lib/mappers';

export type ColumnKey = 'new' | 'edging' | 'graduated';

interface ColumnState {
  tokens: Token[];
  loading: boolean;
  page: number;
  hasMore: boolean;
  search: string;
}

interface TrenchesStore {
  columns: Record<ColumnKey, ColumnState>;
  fetchColumn: (key: ColumnKey, silent?: boolean) => Promise<void>;
  loadMore: (key: ColumnKey) => Promise<void>;
  setColumnSearch: (key: ColumnKey, search: string) => void;
}

const PAGE_SIZE = 20;

function defaultColumn(): ColumnState {
  return { tokens: [], loading: false, page: 1, hasMore: true, search: '' };
}

export const useTrenchesStore = create<TrenchesStore>((set, get) => {
  const _gens: Record<ColumnKey, number> = { new: 0, edging: 0, graduated: 0 };

  async function fetchColumnTokens(
    key: ColumnKey,
    page: number,
    search: string,
  ): Promise<{ tokens: Token[]; hasMore: boolean }> {
    if (key === 'new') {
      const result = await api.getTokens({
        status: 'active',
        sort: 'newest',
        order: 'desc',
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      const all = result.tokens.map(mapApiTokenToToken);
      const filtered = all.filter((t) => t.graduationProgress < 75 && t.deployBlock > 0);
      return { tokens: filtered, hasMore: page < result.pagination.totalPages };
    }

    if (key === 'edging') {
      const result = await api.getTokens({
        status: 'active',
        sort: 'marketCap',
        order: 'desc',
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      const all = result.tokens.map(mapApiTokenToToken);
      const filtered = all.filter((t) => t.graduationProgress >= 75);
      return { tokens: filtered, hasMore: page < result.pagination.totalPages };
    }

    // graduated: merge graduated + migrated
    const [grad, migrated] = await Promise.all([
      api.getTokens({
        status: 'graduated',
        sort: 'newest',
        order: 'desc',
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      }),
      api.getTokens({
        status: 'migrated',
        sort: 'newest',
        order: 'desc',
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      }),
    ]);

    const tokens = [
      ...grad.tokens.map(mapApiTokenToToken),
      ...migrated.tokens.map(mapApiTokenToToken),
    ].sort((a, b) => b.createdAt - a.createdAt);

    const hasMore =
      page < grad.pagination.totalPages || page < migrated.pagination.totalPages;

    return { tokens, hasMore };
  }

  return {
    columns: {
      new: defaultColumn(),
      edging: defaultColumn(),
      graduated: defaultColumn(),
    },

    fetchColumn: async (key, silent = false) => {
      const gen = ++_gens[key];
      const { search } = get().columns[key];

      if (!silent) {
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: { ...s.columns[key], loading: true, page: 1 },
          },
        }));
      }

      try {
        const { tokens, hasMore } = await fetchColumnTokens(key, 1, search);
        if (gen !== _gens[key]) return;
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: { ...s.columns[key], tokens, loading: false, page: 1, hasMore },
          },
        }));
      } catch {
        if (gen !== _gens[key]) return;
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: { ...s.columns[key], loading: false },
          },
        }));
      }
    },

    loadMore: async (key) => {
      const col = get().columns[key];
      if (col.loading || !col.hasMore) return;

      const nextPage = col.page + 1;
      const gen = ++_gens[key];

      set((s) => ({
        columns: {
          ...s.columns,
          [key]: { ...s.columns[key], loading: true },
        },
      }));

      try {
        const { tokens, hasMore } = await fetchColumnTokens(key, nextPage, col.search);
        if (gen !== _gens[key]) return;
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: {
              ...s.columns[key],
              tokens: [...s.columns[key].tokens, ...tokens],
              loading: false,
              page: nextPage,
              hasMore,
            },
          },
        }));
      } catch {
        if (gen !== _gens[key]) return;
        set((s) => ({
          columns: {
            ...s.columns,
            [key]: { ...s.columns[key], loading: false },
          },
        }));
      }
    },

    setColumnSearch: (key, search) => {
      set((s) => ({
        columns: {
          ...s.columns,
          [key]: { ...s.columns[key], search },
        },
      }));
      get().fetchColumn(key);
    },
  };
});

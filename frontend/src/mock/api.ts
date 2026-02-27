import type { PaginatedResponse } from '@/types/api';
import type { Token, TokenFilter } from '@/types/token';
import type { Trade } from '@/types/trade';
import { MOCK_TOKENS } from './tokens';
import { generateTradesForToken } from './trades';
import { TOKENS_PER_PAGE, TRADES_PER_PAGE } from '@/config/constants';

function delay(ms = 300): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms + Math.random() * 200));
}

export async function fetchTokens(
  filter: TokenFilter,
  page = 1,
  pageSize = TOKENS_PER_PAGE,
): Promise<PaginatedResponse<Token>> {
  await delay();

  let tokens = [...MOCK_TOKENS];

  // Filter by search
  if (filter.search) {
    const q = filter.search.toLowerCase();
    tokens = tokens.filter(
      t => t.name.toLowerCase().includes(q) ||
           t.symbol.toLowerCase().includes(q) ||
           t.address.toLowerCase().includes(q),
    );
  }

  // Filter by status
  if (filter.status !== 'all') {
    tokens = tokens.filter(t => t.status === filter.status);
  }

  // Sort
  switch (filter.sort) {
    case 'volume':
      tokens.sort((a, b) => b.volume24hSats - a.volume24hSats);
      break;
    case 'marketCap':
      tokens.sort((a, b) => b.marketCapSats - a.marketCapSats);
      break;
    case 'price':
      tokens.sort((a, b) => b.currentPriceSats - a.currentPriceSats);
      break;
    case 'change':
      tokens.sort((a, b) => b.priceChange24h - a.priceChange24h);
      break;
    case 'newest':
      tokens.sort((a, b) => b.createdAt - a.createdAt);
      break;
  }

  const start = (page - 1) * pageSize;
  const paginated = tokens.slice(start, start + pageSize);

  return {
    data: paginated,
    total: tokens.length,
    page,
    pageSize,
    hasMore: start + pageSize < tokens.length,
  };
}

export async function fetchToken(address: string): Promise<Token | null> {
  await delay(200);
  return MOCK_TOKENS.find(t => t.address === address) ?? null;
}

export async function fetchTrades(
  tokenAddress: string,
  page = 1,
  pageSize = TRADES_PER_PAGE,
): Promise<PaginatedResponse<Trade>> {
  await delay(250);
  const token = MOCK_TOKENS.find(t => t.address === tokenAddress);
  if (!token) return { data: [], total: 0, page, pageSize, hasMore: false };

  const allTrades = generateTradesForToken(token, 100);
  const start = (page - 1) * pageSize;
  const paginated = allTrades.slice(start, start + pageSize);

  return {
    data: paginated,
    total: allTrades.length,
    page,
    pageSize,
    hasMore: start + pageSize < allTrades.length,
  };
}

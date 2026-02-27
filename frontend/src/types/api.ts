export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface OHLCVCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PlatformStats {
  totalTokensLaunched: number;
  totalGraduated: number;
  totalVolumeSats: number;
  totalTrades: number;
  activeTokens: number;
}

export interface CreatorProfile {
  address: string;
  displayName: string;
  tokensLaunched: number;
  totalVolumeSats: number;
  joinedAt: number;
}

export interface OHLCVCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeframeKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

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

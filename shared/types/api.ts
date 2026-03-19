/**
 * API request/response types shared across backend and frontend.
 * Matches contracts/rest-api.md specification.
 */

import type { TokenDocument, TokenStatus } from './token.js';
import type { TradeDocument } from './trade.js';

// Pagination
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Token endpoints
export interface TokenListQuery {
  page?: number;
  limit?: number;
  status?: TokenStatus | 'all';
  search?: string;
  sort?: 'volume24h' | 'marketCap' | 'price' | 'newest';
  order?: 'asc' | 'desc';
}

export interface TokenListResponse {
  tokens: TokenDocument[];
  pagination: PaginationMeta;
}

export type TokenDetailResponse = TokenDocument;

// Trade endpoints
export interface TradeListQuery {
  page?: number;
  limit?: number;
}

export interface TradeListResponse {
  trades: TradeDocument[];
  pagination: PaginationMeta;
}

// Simulate endpoints
export interface SimulateBuyRequest {
  tokenAddress: string;
  btcAmountSats: string;
}

export interface SimulateSellRequest {
  tokenAddress: string;
  tokenAmount: string;
}

export interface SimulationFees {
  platform: string;
  creator: string;
  minter: string;
  flywheel: string;
  total: string;
}

export interface SimulateBuyResponse {
  tokensOut: string;
  fees: SimulationFees;
  priceImpactBps: number;
  newPriceSats: string;
  effectivePriceSats: string;
}

export interface SimulateSellResponse {
  btcOut: string;
  fees: SimulationFees;
  priceImpactBps: number;
  newPriceSats: string;
  effectivePriceSats: string;
}

// Price endpoint
export interface PriceResponse {
  currentPriceSats: string;
  virtualBtcReserve: string;
  virtualTokenSupply: string;
  realBtcReserve: string;
  isOptimistic: boolean;
  change24hBps: number;
}

// Stats endpoint
export interface StatsResponse {
  totalTokens: number;
  totalGraduated: number;
  totalVolumeSats: string;
  totalTrades: number;
  lastBlockIndexed: number;
}

// Token registration (POST /v1/tokens)
export interface CreateTokenRequest {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string; // URL from POST /v1/upload/image, or empty string
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
  };
  creatorAddress: string;
  contractAddress: string;
  config: {
    creatorAllocationBps: number;
    buyTaxBps: number;
    sellTaxBps: number;
    flywheelDestination: 'burn' | 'communityPool' | 'creator';
  };
  deployTxHash: string;
}

// OHLCV endpoint
export type TimeframeKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface OHLCVCandle {
  time: number;   // unix seconds (bucket start)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // total btcAmount in sats for the bucket
}

export interface OHLCVResponse {
  candles: OHLCVCandle[];
  timeframe: TimeframeKey;
  tokenAddress: string;
}

// Profile endpoint
export interface ProfileTokensResponse {
  tokens: TokenDocument[];
}

// Image upload
export interface UploadImageRequest {
  data: string; // base64 encoded image data (no data URI prefix)
  contentType: string; // e.g. 'image/png'
}

export interface UploadImageResponse {
  url: string;
}

// Holder endpoints
export interface HolderEntry {
  address: string;
  balance: string;
  percent: number;
}

export interface HolderListResponse {
  holders: HolderEntry[];
  holderCount: number;
  circulatingSupply: string;
}

// Error response
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}

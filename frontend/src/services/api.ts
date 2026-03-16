/**
 * REST API client for OPump backend.
 * Typed fetch wrapper for all endpoints per contracts/rest-api.md.
 */

import type {
  TokenListQuery,
  TokenListResponse,
  TokenDetailResponse,
  TradeListResponse,
  SimulateBuyRequest,
  SimulateBuyResponse,
  SimulateSellRequest,
  SimulateSellResponse,
  PriceResponse,
  StatsResponse,
  CreateTokenRequest,
  ProfileTokensResponse,
  ApiErrorResponse,
  TimeframeKey,
  OHLCVResponse,
  UploadImageRequest,
  UploadImageResponse,
} from '@shared/types/api';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:9850';

class ApiError extends Error {
  constructor(
    public statusCode: number,
    public errorCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Partial<ApiErrorResponse>;
      throw new ApiError(
        res.status,
        body.error || 'UnknownError',
        body.message || `Request failed with status ${res.status}`,
      );
    }

    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== '',
  );
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}


export function getTokens(query: TokenListQuery = {}): Promise<TokenListResponse> {
  const qs = buildQueryString({
    page: query.page,
    limit: query.limit,
    status: query.status,
    search: query.search,
    sort: query.sort,
    order: query.order,
  });
  return request<TokenListResponse>(`/v1/tokens${qs}`);
}

export function getToken(address: string): Promise<TokenDetailResponse> {
  return request<TokenDetailResponse>(`/v1/tokens/${encodeURIComponent(address)}`);
}

export function getTrades(
  address: string,
  page = 1,
  limit = 50,
): Promise<TradeListResponse> {
  return request<TradeListResponse>(
    `/v1/tokens/${encodeURIComponent(address)}/trades?page=${page}&limit=${limit}`,
  );
}

export function getTokenPrice(address: string): Promise<PriceResponse> {
  return request<PriceResponse>(`/v1/tokens/${encodeURIComponent(address)}/price`);
}

export function getOHLCV(
  address: string,
  timeframe: TimeframeKey = '15m',
  limit = 200,
): Promise<OHLCVResponse> {
  return request<OHLCVResponse>(
    `/v1/tokens/${encodeURIComponent(address)}/ohlcv?timeframe=${timeframe}&limit=${limit}`,
  );
}


export function simulateBuy(body: SimulateBuyRequest): Promise<SimulateBuyResponse> {
  return request<SimulateBuyResponse>('/v1/simulate/buy', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function simulateSell(body: SimulateSellRequest): Promise<SimulateSellResponse> {
  return request<SimulateSellResponse>('/v1/simulate/sell', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}


export function getStats(): Promise<StatsResponse> {
  return request<StatsResponse>('/v1/stats');
}


export function createToken(body: CreateTokenRequest): Promise<TokenDetailResponse> {
  return request<TokenDetailResponse>('/v1/tokens', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}


export function uploadImage(body: UploadImageRequest): Promise<UploadImageResponse> {
  return request<UploadImageResponse>('/v1/upload/image', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getProfileTokens(address: string): Promise<ProfileTokensResponse> {
  return request<ProfileTokensResponse>(`/v1/profile/${encodeURIComponent(address)}/tokens`);
}

export { ApiError };

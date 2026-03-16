import BigNumber from 'bignumber.js';
import { SATS_PER_BTC, TOKEN_UNITS_PER_TOKEN } from '@/config/constants';

export function satsToBtc(sats: number): number {
  return sats / SATS_PER_BTC;
}

export function btcToSats(btc: number): number {
  return Math.round(btc * SATS_PER_BTC);
}

export function tokenUnitsToTokens(units: number | string): number {
  if (typeof units === 'string') return new BigNumber(units).div(TOKEN_UNITS_PER_TOKEN).toNumber();
  return units / TOKEN_UNITS_PER_TOKEN;
}

/**
 * Convert human-readable token count to on-chain units (string).
 * Uses BigNumber to avoid precision loss for amounts exceeding Number.MAX_SAFE_INTEGER.
 */
export function tokensToUnits(tokens: number): string {
  return new BigNumber(tokens).times(TOKEN_UNITS_PER_TOKEN).integerValue().toFixed(0);
}

export function formatBtc(sats: number | string, decimals = 4): string {
  const s = Number(sats);
  const btc = satsToBtc(s);
  if (btc >= 1) return `${btc.toFixed(decimals)} BTC`;
  if (s >= 1_000_000) return `${(s / 1_000_000).toFixed(2)}M sats`;
  if (s >= 1_000) return `${(s / 1_000).toFixed(1)}k sats`;
  return `${s.toLocaleString()} sats`;
}

export function formatSats(sats: number): string {
  if (sats >= 1_000_000_000) return `${(sats / 1_000_000_000).toFixed(2)}B`;
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(2)}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1)}k`;
  return sats.toLocaleString();
}

/**
 * Format token units for display. Accepts string to preserve precision
 * for amounts exceeding Number.MAX_SAFE_INTEGER (~9 * 10^15).
 */
export function formatTokenAmount(units: number | string): string {
  const bn = new BigNumber(units);
  const tokens = bn.div(TOKEN_UNITS_PER_TOKEN);
  if (tokens.gte(1_000_000_000)) return `${tokens.div(1_000_000_000).toFixed(2)}B`;
  if (tokens.gte(1_000_000)) return `${tokens.div(1_000_000).toFixed(2)}M`;
  if (tokens.gte(1_000)) return `${tokens.div(1_000).toFixed(1)}k`;
  return tokens.toFormat(2);
}

export function formatPrice(sats: number): string {
  if (sats >= SATS_PER_BTC) return `${(sats / SATS_PER_BTC).toFixed(6)} BTC`;
  if (sats >= 1000) return `${(sats / 1000).toFixed(2)}k sats`;
  if (sats >= 1) return `${sats.toFixed(2)} sats`;
  return `${sats.toFixed(6)} sats`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString();
}

export function shortenAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

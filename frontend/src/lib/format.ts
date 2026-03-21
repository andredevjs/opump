import BigNumber from 'bignumber.js';
import { SATS_PER_BTC, TOKEN_UNITS_PER_TOKEN, TOTAL_SUPPLY_WHOLE_TOKENS } from '@/config/constants';

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
  // S27: Use BigNumber for string inputs to preserve precision for large values
  const val = new BigNumber(sats);
  const s = val.toNumber();
  const btc = val.div(SATS_PER_BTC).toNumber();
  if (btc >= 1) return `${btc.toFixed(decimals)} BTC`;
  if (s >= 1_000_000) return `${(s / 1_000_000).toFixed(2)}M sats`;
  if (s >= 1_000) return `${(s / 1_000).toFixed(1)}k sats`;
  return `${s.toLocaleString()} sats`;
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

export function satsToUsd(sats: number | string, btcPrice: number): number {
  const val = new BigNumber(sats);
  return val.div(SATS_PER_BTC).times(btcPrice).toNumber();
}

export function usdToSats(usd: number, btcPrice: number): number {
  if (btcPrice <= 0) return 0;
  return Math.round((usd / btcPrice) * SATS_PER_BTC);
}

export function formatUsd(sats: number | string, btcPrice: number): string {
  const usd = satsToUsd(sats, btcPrice);
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}k`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(2)}`;
  if (usd === 0) return '$0.00';
  // Sub-cent: show enough decimals for 2 significant digits
  const digits = Math.max(2, Math.ceil(-Math.log10(usd)) + 2);
  return `$${usd.toFixed(digits)}`;
}

export function formatUsdPrice(sats: number, btcPrice: number): string {
  const usd = satsToUsd(sats, btcPrice);
  if (usd === 0) return '$0.00';
  if (usd >= 1) return `$${usd.toFixed(6)}`;
  if (usd >= 0.01) return `$${usd.toFixed(6)}`;
  // Sub-cent: show enough decimals for 4 significant digits
  const digits = Math.max(6, Math.ceil(-Math.log10(usd)) + 4);
  return `$${usd.toFixed(digits)}`;
}

export function priceSatsToMcapUsd(pricePerToken: number, btcPrice: number): number {
  return pricePerToken * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice;
}

export function formatMcapUsd(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export function shortenAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  // S26: Handle future timestamps gracefully
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

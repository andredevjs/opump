import BigNumber from 'bignumber.js';
import {
  GRADUATION_THRESHOLD_SATS as GRADUATION_THRESHOLD_SATS_BI,
  DEFAULT_MAX_SUPPLY as DEFAULT_MAX_SUPPLY_BI,
  TOKEN_UNITS_PER_TOKEN as TOKEN_UNITS_BI,
} from '@shared/constants/bonding-curve';

BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

export const SATS_PER_BTC = 100_000_000;
export const TOKEN_UNITS_PER_TOKEN = Number(TOKEN_UNITS_BI); // 100_000_000

// Re-export curve constants as display-friendly JS numbers / BigNumber
export const DEFAULT_MAX_SUPPLY = new BigNumber(DEFAULT_MAX_SUPPLY_BI.toString());
export const GRADUATION_THRESHOLD_SATS = Number(GRADUATION_THRESHOLD_SATS_BI); // 69M sats (0.69 BTC)

// Total supply in whole tokens (for price → mcap conversion)
export const TOTAL_SUPPLY_WHOLE_TOKENS = 1_000_000_000; // 1B tokens

// Fee structure (display percentages — canonical bps live in shared/constants)
export const TOTAL_FEE_PERCENT = 1.25;      // 125 bps
export const PLATFORM_FEE_PERCENT = 1.0;    // 100 bps
export const CREATOR_FEE_PERCENT = 0.25;    //  25 bps

// Launch limits (display percentages)
export const MAX_CREATOR_ALLOCATION_PERCENT = 70;
export const MAX_AIRDROP_PERCENT = 70;
export const MAX_COMBINED_ALLOCATION_PERCENT = 70;
export const MAX_BUY_TAX_PERCENT = 3;
export const MAX_SELL_TAX_PERCENT = 5;

// Airdrop communities — placeholder holder counts (dynamic fetching is a follow-up)
export const AIRDROP_COMMUNITIES = {
  bitcoin_puppets: { name: 'Bitcoin Puppets', type: 'ordinals' as const, estimatedHolders: 10_000 },
  motocats:        { name: 'MotoCats',        type: 'ordinals' as const, estimatedHolders: 3_000 },
  moto:            { name: '$MOTO',           type: 'op20' as const,     estimatedHolders: 5_000 },
  pill:            { name: '$PILL',           type: 'op20' as const,     estimatedHolders: 2_000 },
} as const;

// Factory / vault address — single source of truth
export const FACTORY_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '';
export const VAULT_ADDRESS = FACTORY_ADDRESS;

// Chart theme colors — shared between PriceChart and ErrorBoundary (S30)
export const CHART_THEME = {
  background: 'transparent',
  textColor: '#8888a0',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 11,
  gridColor: '#1a1a27',
  crosshairColor: '#f5c518',
  borderColor: '#2a2a3d',
  upColor: '#22c55e',
  downColor: '#ef4444',
  lineColor: '#f5c518',
  volumeColor: '#f5c518',
  errorBg: '#0a0a12',
  errorCardBg: '#12121a',
  errorBorder: '#2a2a3d',
  errorText: '#e4e4ed',
  errorMuted: 'rgb(156 163 175)', // gray-400
  errorButton: '#1a1a2e',
  errorAccent: '#f5c518',
  errorAccentHover: '#d4a910',
} as const;

// UI
export const PRICE_UPDATE_INTERVAL_MS = 2500;

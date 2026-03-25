import BigNumber from 'bignumber.js';

BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

export const SATS_PER_BTC = 100_000_000;
export const TOKEN_UNITS_PER_TOKEN = 10 ** 8; // 100_000_000

// Bonding curve initial virtual reserves
// virtualBtc is small relative to graduation threshold for ~100x price curve
export const INITIAL_VIRTUAL_BTC_SATS = new BigNumber('767000'); // 0.00767 BTC
export const INITIAL_VIRTUAL_TOKEN_SUPPLY = new BigNumber('100000000000000000'); // 1B tokens * 10^8 decimals
export const K = INITIAL_VIRTUAL_BTC_SATS.times(INITIAL_VIRTUAL_TOKEN_SUPPLY);

// Graduation threshold
export const GRADUATION_THRESHOLD_SATS = 6_900_000; // 6.9M sats

// Total supply in whole tokens (for price → mcap conversion)
export const TOTAL_SUPPLY_WHOLE_TOKENS = 1_000_000_000; // 1B tokens (INITIAL_VIRTUAL_TOKEN_SUPPLY / TOKEN_UNITS_PER_TOKEN)

// Fee structure (percentages — matches shared TOTAL_FEE_BPS=125, i.e. 1.25%)
export const TOTAL_FEE_PERCENT = 1.25;      // 125 bps
export const PLATFORM_FEE_PERCENT = 1.0;    // 100 bps
export const CREATOR_FEE_PERCENT = 0.25;    //  25 bps

// Launch limits
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

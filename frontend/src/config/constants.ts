import BigNumber from 'bignumber.js';

BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

export const SATS_PER_BTC = 100_000_000;
export const TOKEN_DECIMALS = 8;
export const TOKEN_UNITS_PER_TOKEN = 10 ** TOKEN_DECIMALS; // 100_000_000

// Price precision: 10^18 for sub-sat accuracy (matches contract PRICE_PRECISION)
export const PRICE_PRECISION = new BigNumber('1000000000000000000'); // 10^18

// Divisor to convert PRICE_PRECISION-scaled values to sats per whole token
export const PRICE_DISPLAY_DIVISOR = 1e10; // PRICE_PRECISION / TOKEN_UNITS_PER_TOKEN

// Bonding curve initial virtual reserves
// virtualBtc is small relative to graduation threshold for ~100x price curve
export const INITIAL_VIRTUAL_BTC_SATS = new BigNumber('767000'); // 0.00767 BTC
export const INITIAL_VIRTUAL_TOKEN_SUPPLY = new BigNumber('100000000000000000'); // 1B tokens * 10^8 decimals
export const K = INITIAL_VIRTUAL_BTC_SATS.times(INITIAL_VIRTUAL_TOKEN_SUPPLY);

// Graduation threshold
export const GRADUATION_THRESHOLD_SATS = 6_900_000; // 6.9M sats

// Fee structure (percentages — matches shared TOTAL_FEE_BPS=150, i.e. 1.5%)
export const TOTAL_FEE_PERCENT = 1.5;       // 150 bps
export const PLATFORM_FEE_PERCENT = 1.0;    // 100 bps
export const CREATOR_FEE_PERCENT = 0.25;    //  25 bps
export const MINTER_FEE_PERCENT = 0.25;     //  25 bps

// Launch limits
export const MAX_CREATOR_ALLOCATION_PERCENT = 10;
export const MIN_AIRDROP_PERCENT = 0.1;
export const MAX_AIRDROP_PERCENT = 20;
export const MAX_BUY_TAX_PERCENT = 3;
export const MAX_SELL_TAX_PERCENT = 5;

// Minter reward
export const MINTER_HOLD_BLOCKS = 4320; // ~30 days

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
  crosshairColor: '#f7931a',
  borderColor: '#2a2a3d',
  upColor: '#22c55e',
  downColor: '#ef4444',
  lineColor: '#f7931a',
  volumeColor: '#f7931a',
  errorBg: '#0a0a12',
  errorCardBg: '#12121a',
  errorBorder: '#2a2a3d',
  errorText: '#e4e4ed',
  errorMuted: 'rgb(156 163 175)', // gray-400
  errorButton: '#1a1a2e',
  errorAccent: 'rgb(234 88 12)', // orange-600
  errorAccentHover: 'rgb(194 65 12)', // orange-700
} as const;

// UI
export const TOKENS_PER_PAGE = 12;
export const TRADES_PER_PAGE = 20;
export const PRICE_UPDATE_INTERVAL_MS = 2500;

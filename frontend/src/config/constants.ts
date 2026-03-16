import BigNumber from 'bignumber.js';

BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

export const SATS_PER_BTC = 100_000_000;
export const TOKEN_DECIMALS = 8;
export const TOKEN_UNITS_PER_TOKEN = 10 ** TOKEN_DECIMALS; // 100_000_000

// Bonding curve initial virtual reserves
export const INITIAL_VIRTUAL_BTC_SATS = new BigNumber('3000000000'); // 30 BTC
export const INITIAL_VIRTUAL_TOKEN_SUPPLY = new BigNumber('100000000000000000'); // 1B tokens * 10^8 decimals
export const K = INITIAL_VIRTUAL_BTC_SATS.times(INITIAL_VIRTUAL_TOKEN_SUPPLY);

// Graduation threshold
export const GRADUATION_THRESHOLD_SATS = 6_900_000; // 6.9M sats

// Fee structure
export const TOTAL_FEE_PERCENT = 1.5;
export const PLATFORM_FEE_PERCENT = 1.0;
export const CREATOR_FEE_PERCENT = 0.25;
export const MINTER_FEE_PERCENT = 0.25;

// Launch limits
export const MAX_CREATOR_ALLOCATION_PERCENT = 10;
export const MIN_AIRDROP_PERCENT = 0.1;
export const MAX_AIRDROP_PERCENT = 20;
export const MAX_BUY_TAX_PERCENT = 3;
export const MAX_SELL_TAX_PERCENT = 5;

// Minter reward
export const MINTER_HOLD_BLOCKS = 4320; // ~30 days

// UI
export const TOKENS_PER_PAGE = 12;
export const TRADES_PER_PAGE = 20;
export const PRICE_UPDATE_INTERVAL_MS = 2500;

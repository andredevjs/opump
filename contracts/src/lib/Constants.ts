import { u256 } from '@btc-vision/as-bignum/assembly';

// Virtual reserves (initial bonding curve state)
export const INITIAL_VIRTUAL_BTC: u256 = u256.fromString('3000000000'); // 30 BTC = 3B sats
export const INITIAL_VIRTUAL_TOKEN: u256 = u256.fromString('100000000000000000'); // 1B * 10^8

// Default max supply
export const DEFAULT_MAX_SUPPLY: u256 = u256.fromString('100000000000000000'); // 1B * 10^8

// Graduation threshold
export const DEFAULT_GRADUATION_THRESHOLD: u256 = u256.fromString('6900000'); // 0.069 BTC

// Trade limits
export const MIN_TRADE_AMOUNT: u256 = u256.fromString('10000'); // 10,000 sats

// Fee schedule (basis points)
export const PLATFORM_FEE_BPS: u256 = u256.fromU32(100); // 1%
export const CREATOR_FEE_BPS: u256 = u256.fromU32(25); // 0.25%
export const MINTER_FEE_BPS: u256 = u256.fromU32(25); // 0.25%
export const TOTAL_FEE_BPS: u256 = u256.fromU32(150); // 1.5% total
export const FEE_DENOMINATOR: u256 = u256.fromU32(10000);

// Minter reward timing
export const MINTER_WINDOW_BLOCKS: u256 = u256.fromU32(4320); // ~30 days
export const MINTER_HOLD_BLOCKS: u256 = u256.fromU32(4320); // must hold ~30 days

// Creator allocation caps
export const MAX_CREATOR_ALLOCATION_BPS: u256 = u256.fromU32(1000); // 10%
export const MAX_COMBINED_ALLOCATION_BPS: u256 = u256.fromU32(2500); // 25%

// Reservation
export const RESERVATION_TTL_BLOCKS: u256 = u256.fromU32(3);

// Flywheel max
export const MAX_BUY_TAX_BPS: u256 = u256.fromU32(300); // 3%
export const MAX_SELL_TAX_BPS: u256 = u256.fromU32(500); // 5%

// Penalty
export const CANCEL_PENALTY_BPS: u256 = u256.fromU32(5000); // 50%

// Token decimals scaling factor for price calculation (10^8)
export const TOKEN_DECIMALS_FACTOR: u256 = u256.fromString('100000000');

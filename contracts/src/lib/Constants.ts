import { u256 } from '@btc-vision/as-bignum/assembly';

// Virtual reserves (initial bonding curve state)
// virtualBtc is small relative to graduation threshold to create ~100x price curve
export const INITIAL_VIRTUAL_BTC: u256 = u256.fromString('767000'); // 0.00767 BTC — ~100x at graduation
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
export const TOTAL_FEE_BPS: u256 = u256.fromU32(125); // 1.25% total
export const FEE_DENOMINATOR: u256 = u256.fromU32(10000);

// Creator / airdrop allocation caps
export const MAX_CREATOR_ALLOCATION_BPS: u256 = u256.fromU32(7000); // 70%
export const MAX_AIRDROP_BPS: u256 = u256.fromU32(7000); // 70%
export const MAX_COMBINED_ALLOCATION_BPS: u256 = u256.fromU32(7000); // 70% (creator + airdrop combined)

// Reservation
export const RESERVATION_TTL_BLOCKS: u256 = u256.fromU32(3);

// Flywheel max
export const MAX_BUY_TAX_BPS: u256 = u256.fromU32(300); // 3%
export const MAX_SELL_TAX_BPS: u256 = u256.fromU32(500); // 5%

// Reserved for future cancellation refund mechanism — not yet implemented
export const CANCEL_PENALTY_BPS: u256 = u256.fromU32(5000); // 50%

// Price precision factor for on-chain price calculation (10^18)
// Needed because initial price is sub-sat with small virtualBtc
export const PRICE_PRECISION: u256 = u256.fromString('1000000000000000000');

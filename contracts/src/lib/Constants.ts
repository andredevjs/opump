import { u256 } from '@btc-vision/as-bignum/assembly';

// ── Exponential bonding curve ───────────────────────────
// Price(x) = a * e^(b*x), params derived at deployment from curveSupply + graduationThreshold.

// Default max supply: 1B tokens * 10^8 decimals
export const DEFAULT_MAX_SUPPLY: u256 = u256.fromString('100000000000000000');

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

// Reserved for future cancellation refund mechanism
export const CANCEL_PENALTY_BPS: u256 = u256.fromU32(5000); // 50%

// Price precision factor for on-chain price calculation (10^18)
export const PRICE_PRECISION: u256 = u256.fromString('1000000000000000000');

// ── Exponential curve constants ─────────────────────────

// Token units per whole token (10^8 for 8 decimals)
export const TOKEN_UNITS_PER_TOKEN: u256 = u256.fromString('100000000');

// ln(100) * 10^18 — hardcoded for precision
export const LN_100_SCALED: u256 = u256.fromString('4605170185988091368');

// Graduation at 80% of curve supply sold (basis points)
export const GRAD_SUPPLY_FRACTION_BPS: u256 = u256.fromU32(8000);

// Price multiplier - 1 = 99 (used in parameter derivation)
export const PRICE_MULTIPLIER_MINUS_1: u256 = u256.fromU32(99);

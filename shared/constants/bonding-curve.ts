/**
 * Bonding curve constants shared across contracts, backend, and frontend.
 * All values match the on-chain LaunchToken contract.
 *
 * Exponential bonding curve: Price(x) = a * e^(b*x)
 * Parameters a, b are derived at deployment from curveSupply and graduationThreshold.
 */

// Graduation
export const GRADUATION_THRESHOLD_SATS = 6_900_000n; // 0.069 BTC

// Trade limits
export const MIN_TRADE_SATS = 10_000n; // ~$1

// Fee schedule (basis points, 1 bp = 0.01%)
export const PLATFORM_FEE_BPS = 100n; // 1%
export const CREATOR_FEE_BPS = 25n; // 0.25%
export const TOTAL_FEE_BPS = 125n; // 1.25% total
export const FEE_DENOMINATOR = 10_000n;

// Creator / airdrop allocation caps
export const MAX_CREATOR_ALLOCATION_BPS = 7_000n; // 70%
export const MAX_AIRDROP_BPS = 7_000n; // 70%
export const MAX_COMBINED_ALLOCATION_BPS = 7_000n; // 70% (creator + airdrop combined)

// Reservation
export const RESERVATION_TTL_BLOCKS = 3n; // ~30 minutes

// Token defaults
export const DEFAULT_MAX_SUPPLY = 100_000_000_000_000_000n; // 1B tokens * 10^8 decimals
export const TOKEN_DECIMALS = 8;
export const TOKEN_UNITS_PER_TOKEN = 10n ** BigInt(TOKEN_DECIMALS); // 10^8

// Price precision factor for on-chain calculations (10^18)
export const PRICE_PRECISION = 10n ** 18n;

// Divisor to convert PRICE_PRECISION-scaled values to sats per whole token
// = PRICE_PRECISION / 10^TOKEN_DECIMALS = 10^10
export const PRICE_DISPLAY_DIVISOR = 1e10;

// ── Exponential curve constants ─────────────────────────

// ln(100) * 10^18 — hardcoded for precision
export const LN_100_SCALED = 4_605_170_185_988_091_368n;

// Graduation at 80% of curve supply sold (basis points)
export const GRAD_SUPPLY_FRACTION_BPS = 8_000n;

// Price multiplier target (100x from initial to graduation)
export const PRICE_MULTIPLIER = 100n;

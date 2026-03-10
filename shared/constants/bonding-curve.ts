/**
 * Bonding curve constants shared across contracts, backend, and frontend.
 * All values match the on-chain LaunchToken contract.
 */

// Virtual reserves (initial state of the bonding curve)
export const INITIAL_VIRTUAL_BTC_SATS = 3_000_000_000n; // 30 BTC in sats
export const INITIAL_VIRTUAL_TOKEN_SUPPLY = 100_000_000_000_000_000n; // 1B tokens * 10^8 decimals
export const K_CONSTANT = INITIAL_VIRTUAL_BTC_SATS * INITIAL_VIRTUAL_TOKEN_SUPPLY;

// Graduation
export const GRADUATION_THRESHOLD_SATS = 6_900_000n; // 0.069 BTC

// Trade limits
export const MIN_TRADE_SATS = 10_000n; // ~$1

// Fee schedule (basis points, 1 bp = 0.01%)
export const PLATFORM_FEE_BPS = 100n; // 1%
export const CREATOR_FEE_BPS = 25n; // 0.25%
export const MINTER_FEE_BPS = 25n; // 0.25%
export const TOTAL_FEE_BPS = 150n; // 1.5% total
export const FEE_DENOMINATOR = 10_000n;

// Minter rewards
export const MINTER_WINDOW_BLOCKS = 4_320n; // ~30 days of Bitcoin blocks
export const MINTER_HOLD_BLOCKS = 4_320n; // must hold for ~30 days

// Creator allocation caps
export const MAX_CREATOR_ALLOCATION_BPS = 1_000n; // 10%
export const MAX_AIRDROP_BPS = 2_000n; // 20%
export const MAX_COMBINED_ALLOCATION_BPS = 2_500n; // 25%

// Reservation
export const RESERVATION_TTL_BLOCKS = 3n; // ~30 minutes

// Token defaults
export const DEFAULT_MAX_SUPPLY = 100_000_000_000_000_000n; // 1B tokens * 10^8 decimals
export const TOKEN_DECIMALS = 8;

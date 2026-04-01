/**
 * Bonding curve constants — mirrored from shared/constants/bonding-curve.ts.
 * Duplicated here to avoid cross-directory imports that break Netlify's esbuild bundler.
 * Keep in sync with shared/constants/bonding-curve.ts.
 */

// ── Exponential bonding curve ───────────────────────────
// Price(x) = a * e^(b*x), params derived at deployment from curveSupply + graduationThreshold.

export const GRADUATION_THRESHOLD_SATS = 69_000_000n;
export const MIN_TRADE_SATS = 10_000n;
export const PLATFORM_FEE_BPS = 100n;
export const CREATOR_FEE_BPS = 25n;
export const TOTAL_FEE_BPS = 125n;
export const FEE_DENOMINATOR = 10_000n;
export const TOKEN_DECIMALS = 8;
export const TOKEN_UNITS_PER_TOKEN = 10n ** BigInt(TOKEN_DECIMALS); // 10^8
export const PRICE_PRECISION = 10n ** 18n;
export const PRICE_DISPLAY_DIVISOR = 1e10; // PRICE_PRECISION / 10^TOKEN_DECIMALS
export const DEFAULT_MAX_SUPPLY = 100_000_000_000_000_000n; // 1B tokens * 10^8

// Graduation at 80% of curve supply sold (basis points)
export const GRAD_SUPPLY_FRACTION_BPS = 8_000n;

// IMPORTANT: Keep in sync with shared/types/ and shared/constants/
// Shared type definitions (mirrored from shared/types/)

export interface TokenSocials {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
}

export type AirdropCommunity = "bitcoin_puppets" | "motocats" | "moto" | "pill";

export interface AirdropConfig {
  enabled: boolean;
  community: AirdropCommunity;
  percentBps: number;
}

export interface TokenConfig {
  creatorAllocationBps: number;
  airdropBps: number;
  buyTaxBps: number;
  sellTaxBps: number;
  flywheelDestination: "burn" | "creator";
  graduationThreshold: string;
  airdropConfig?: AirdropConfig;
}

export type TokenStatus = "active" | "graduated" | "migrating" | "migrated" | "new";

export interface TokenDocument {
  _id: string;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  socials: TokenSocials;
  creatorAddress: string;
  contractAddress: string;
  currentSupplyOnCurve: string;
  realBtcReserve: string;
  aScaled: string;
  bScaled: string;
  config: TokenConfig;
  status: TokenStatus;
  currentPriceSats: string;
  volume24h: string;
  volumeTotal: string;
  marketCapSats: string;
  tradeCount: number;
  tradeCount24h?: number;
  holderCount: number;
  deployBlock: number;
  deployTxHash: string;
  graduatedAt?: number;

  // Migration
  migrationStatus?: 'pending' | 'tokens_minted' | 'pool_created' | 'liquidity_listed' | 'complete';
  migrationLiquidityTokens?: string;
  migrationTxHashes?: {
    migrate?: string;
    createPool?: string;
    listLiquidity?: string;
  };
  nativeSwapPoolToken?: string;

  createdAt: Date;
  updatedAt: Date;
}

export type TradeType = "buy" | "sell";
export type TradeStatus = "pending" | "confirmed";

export interface TradeFees {
  platform: string;
  creator: string;
  flywheel: string;
}

export interface TradeDocument {
  _id: string;
  tokenAddress: string;
  type: TradeType;
  traderAddress: string;
  btcAmount: string;
  tokenAmount: string;
  pricePerToken: string;
  fees: TradeFees;
  priceImpactBps: number;
  status: TradeStatus;
  blockNumber?: number;
  blockTimestamp?: Date;
  createdAt: Date;
}

export interface CreateTokenRequest {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  socials: TokenSocials;
  creatorAddress: string;
  contractAddress: string;
  config: {
    creatorAllocationBps: number;
    airdropBps: number;
    buyTaxBps: number;
    sellTaxBps: number;
    flywheelDestination: "burn" | "creator";
  };
  deployTxHash: string;
}

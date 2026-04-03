/**
 * Re-exports curve constants from canonical shared source.
 * Local types remain here (function-layer-specific fields).
 */
export {
  GRADUATION_THRESHOLD_SATS,
  MIN_TRADE_SATS,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  TOTAL_FEE_BPS,
  FEE_DENOMINATOR,
  TOKEN_DECIMALS,
  TOKEN_UNITS_PER_TOKEN,
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
  DEFAULT_MAX_SUPPLY,
  GRAD_SUPPLY_FRACTION_BPS,
} from "../../../shared/constants/bonding-curve.ts";

// Function-layer-local type definitions

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

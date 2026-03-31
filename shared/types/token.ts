/**
 * Token types shared across backend and frontend.
 */

export interface TokenSocials {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
}

export type AirdropCommunity = 'bitcoin_puppets' | 'motocats' | 'moto' | 'pill';

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
  flywheelDestination: 'burn' | 'creator';
  graduationThreshold: string;
  airdropConfig?: AirdropConfig;
}

// 'new' reserved for future use: pre-funded tokens awaiting first trade
export type TokenStatus = 'active' | 'graduated' | 'migrating' | 'migrated' | 'new';

export interface TokenDocument {
  _id: string; // token contract address (primary key)
  name: string;
  symbol: string;
  description: string;
  imageUrl: string; // URL to image (S3/CDN) or data URI (dev fallback)
  socials: TokenSocials;
  creatorAddress: string;
  contractAddress: string;

  // Bonding curve state (synced from chain, stored as strings for BigInt precision)
  currentSupplyOnCurve: string;
  realBtcReserve: string;
  aScaled: string;
  bScaled: string;

  // Configuration
  config: TokenConfig;

  // Computed/indexed
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
  migrationLiquidityTokens?: string; // actual minted amount from migrate() — used for pool creation
  migrationTxHashes?: {
    migrate?: string;
    createPool?: string;
    listLiquidity?: string;
  };
  nativeSwapPoolToken?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Token types shared across backend and frontend.
 * Matches data-model.md MongoDB schema.
 */

export interface TokenSocials {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
}

export interface AirdropConfig {
  enabled: boolean;
  type: 'equal' | 'proRata';
  percentBps: number;
  customAddresses?: string[];
}

export interface TokenConfig {
  creatorAllocationBps: number;
  buyTaxBps: number;
  sellTaxBps: number;
  flywheelDestination: 'burn' | 'communityPool' | 'creator';
  graduationThreshold: string;
  airdropConfig?: AirdropConfig;
}

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
  virtualBtcReserve: string;
  virtualTokenSupply: string;
  kConstant: string;
  realBtcReserve: string;

  // Configuration
  config: TokenConfig;

  // Computed/indexed
  status: TokenStatus;
  currentPriceSats: string;
  volume24h: string;
  volumeTotal: string;
  marketCapSats: string;
  tradeCount: number;
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

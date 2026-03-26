export interface Token {
  address: string;
  name: string;
  symbol: string;
  description: string;
  image: string; // first char of name
  imageUrl?: string; // base64 or URL
  creatorAddress: string;
  createdAt: number; // timestamp ms

  // Reserves (in sats / token-units)
  virtualBtcReserve: string; // BigNumber string
  virtualTokenSupply: string;
  realBtcReserve: string;

  // Derived
  currentPriceSats: number; // price per 1 token in sats — converted from string at API boundary
  marketCapSats: number; // converted from string at API boundary
  volume24hSats: number; // converted from string at API boundary
  priceChange24h: number; // percent
  tradeCount24h: number;
  holderCount: number;

  // Config
  creatorAllocationPercent: number;
  buyTaxPercent: number;
  sellTaxPercent: number;
  flywheelDestination?: 'burn' | 'creator';

  // Socials
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;

  // Status
  status: TokenStatus;
  graduationProgress: number; // 0-100
  deployBlock: number; // 0 = unconfirmed, >0 = confirmed at block N
}

export type TokenStatus = 'active' | 'graduated' | 'migrating' | 'migrated' | 'new';

export interface TokenSortOption {
  label: string;
  value: 'volume' | 'marketCap' | 'price' | 'newest';
}

export interface TokenFilter {
  search: string;
  status: TokenStatus | 'all';
  sort: TokenSortOption['value'];
}

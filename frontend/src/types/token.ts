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
  currentPriceSats: number; // price per 1 token in sats
  marketCapSats: number;
  volume24hSats: number;
  priceChange24h: number; // percent
  tradeCount24h: number;
  holderCount: number;

  // Config
  creatorAllocationPercent: number;
  buyTaxPercent: number;
  sellTaxPercent: number;

  // Socials
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;

  // Status
  status: TokenStatus;
  graduationProgress: number; // 0-100
}

export type TokenStatus = 'active' | 'graduated' | 'new';

export interface TokenSortOption {
  label: string;
  value: 'volume' | 'marketCap' | 'price' | 'newest';
}

export interface TokenFilter {
  search: string;
  status: TokenStatus | 'all';
  sort: TokenSortOption['value'];
}

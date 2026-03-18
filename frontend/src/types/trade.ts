export interface Trade {
  id: string;
  tokenAddress: string;
  traderAddress: string;
  type: 'buy' | 'sell';
  btcAmount: number; // sats
  tokenAmount: string; // token-units as string (can exceed Number.MAX_SAFE_INTEGER)
  priceSats: number; // price at time of trade
  fee: number; // sats
  timestamp: number; // ms
  status: TransactionStatus;
  txHash: string;
}

export type TransactionStatus = 'mempool' | 'confirmed';

export interface TradeSimulation {
  type: 'buy' | 'sell';
  inputAmount: string; // sats or token-units as string
  outputAmount: string; // sats or token-units as string
  pricePerToken: number;
  priceImpactPercent: number;
  fee: number;
  newPriceSats: number;
  newVirtualBtc: string;
  newVirtualToken: string;
}

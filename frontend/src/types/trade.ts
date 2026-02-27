export interface Trade {
  id: string;
  tokenAddress: string;
  traderAddress: string;
  type: 'buy' | 'sell';
  btcAmount: number; // sats
  tokenAmount: number; // token-units
  priceSats: number; // price at time of trade
  fee: number; // sats
  timestamp: number; // ms
  status: TransactionStatus;
  txHash: string;
}

export type TransactionStatus = 'broadcasted' | 'mempool' | 'confirmed';

export interface TradeSimulation {
  type: 'buy' | 'sell';
  inputAmount: number;
  outputAmount: number;
  pricePerToken: number;
  priceImpactPercent: number;
  fee: number;
  newPriceSats: number;
  newVirtualBtc: string;
  newVirtualToken: string;
}

export interface PendingTransaction {
  id: string;
  type: 'buy' | 'sell';
  status: TransactionStatus;
  btcAmount: number;
  tokenAmount: number;
  tokenSymbol: string;
  tokenAddress: string;
  timestamp: number;
}

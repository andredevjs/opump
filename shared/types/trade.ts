/**
 * Trade types shared across backend and frontend.
 */

export type TradeType = 'buy' | 'sell';
export type TradeStatus = 'pending' | 'confirmed';

export interface TradeFees {
  platform: string;
  creator: string;
  flywheel: string;
}

export interface TradeDocument {
  _id: string; // tx hash (primary key)
  tokenAddress: string;
  type: TradeType;
  traderAddress: string;
  btcAmount: string; // sats as string for BigInt
  tokenAmount: string; // token amount as string for BigInt
  pricePerToken: string; // sats per token at time of trade
  fees: TradeFees;
  priceImpactBps: number;
  status: TradeStatus;
  blockNumber?: number; // null if pending
  blockTimestamp?: Date;
  createdAt: Date;
}

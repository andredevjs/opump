export interface WalletState {
  connected: boolean;
  address: string | null;
  balanceSats: number;
}

import { create } from 'zustand';
import { MOCK_WALLET_ADDRESS, MOCK_WALLET_BALANCE_SATS } from '@/config/constants';

interface WalletStore {
  connected: boolean;
  address: string | null;
  balanceSats: number;
  connect: () => void;
  disconnect: () => void;
  deductBalance: (sats: number) => void;
  addBalance: (sats: number) => void;
}

export const useWalletStore = create<WalletStore>((set) => ({
  connected: false,
  address: null,
  balanceSats: 0,

  connect: () =>
    set({
      connected: true,
      address: MOCK_WALLET_ADDRESS,
      balanceSats: MOCK_WALLET_BALANCE_SATS,
    }),

  disconnect: () =>
    set({
      connected: false,
      address: null,
      balanceSats: 0,
    }),

  deductBalance: (sats) =>
    set((state) => ({
      balanceSats: Math.max(0, state.balanceSats - sats),
    })),

  addBalance: (sats) =>
    set((state) => ({
      balanceSats: state.balanceSats + sats,
    })),
}));

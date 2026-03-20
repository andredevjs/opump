import { create } from 'zustand';
import { getReferralInfo, linkReferral } from '@/services/api';

interface ReferralEarnings {
  totalSats: string;
  tradeCount: number;
  referralCount: number;
}

interface ReferralStore {
  code: string | null;
  earnings: ReferralEarnings | null;
  referredBy: string | null;
  loading: boolean;
  fetchReferralInfo: (walletAddress: string) => Promise<void>;
  linkReferral: (walletAddress: string, code: string) => Promise<boolean>;
  reset: () => void;
}

export const useReferralStore = create<ReferralStore>((set) => ({
  code: null,
  earnings: null,
  referredBy: null,
  loading: false,

  fetchReferralInfo: async (walletAddress: string) => {
    set({ loading: true });
    try {
      const info = await getReferralInfo(walletAddress);
      set({
        code: info.code,
        earnings: info.earnings,
        referredBy: info.referredBy,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  linkReferral: async (walletAddress: string, code: string) => {
    try {
      await linkReferral(walletAddress, code);
      return true;
    } catch {
      return false;
    }
  },

  reset: () => {
    set({ code: null, earnings: null, referredBy: null, loading: false });
  },
}));

import { create } from 'zustand';

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const MEMPOOL_API = 'https://mempool.space/api/v1/fees/recommended';

interface FeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

interface FeeStore {
  fees: FeeEstimates | null;
  loading: boolean;
  fetchFees: () => Promise<void>;
  startPolling: () => () => void;
}

export const useFeeStore = create<FeeStore>((set, get) => ({
  fees: null,
  loading: true,

  fetchFees: async () => {
    try {
      const res = await fetch(MEMPOOL_API);
      if (!res.ok) return;
      const data: FeeEstimates = await res.json();
      if (typeof data.fastestFee === 'number') {
        set({ fees: data, loading: false });
      }
    } catch {
      // Keep last known fees
      if (get().fees) set({ loading: false });
    }
  },

  startPolling: () => {
    get().fetchFees();
    const id = setInterval(() => get().fetchFees(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  },
}));

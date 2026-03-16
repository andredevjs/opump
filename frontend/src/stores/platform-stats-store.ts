import { create } from 'zustand';

interface PlatformStats {
  totalTokens: number;
  totalTrades: number;
  totalVolumeSats: number;
  totalGraduated: number;
}

interface PlatformStatsStore {
  stats: PlatformStats | null;
  setStats: (stats: PlatformStats) => void;
}

export const usePlatformStatsStore = create<PlatformStatsStore>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
}));

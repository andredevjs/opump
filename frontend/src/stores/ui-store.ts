import { create } from 'zustand';

type ViewMode = 'grid' | 'list';

interface UIStore {
  viewMode: ViewMode;
  mobileMenuOpen: boolean;
  tradeVersion: number;
  setViewMode: (mode: ViewMode) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
  bumpTradeVersion: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: 'grid',
  mobileMenuOpen: false,
  tradeVersion: 0,
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleMobileMenu: () => set((s) => ({ mobileMenuOpen: !s.mobileMenuOpen })),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
  bumpTradeVersion: () => set((s) => ({ tradeVersion: s.tradeVersion + 1 })),
}));

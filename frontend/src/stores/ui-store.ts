import { create } from 'zustand';

type ViewMode = 'grid' | 'list';

interface UIStore {
  viewMode: ViewMode;
  mobileMenuOpen: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  viewMode: 'grid',
  mobileMenuOpen: false,
  setViewMode: (mode) => set({ viewMode: mode }),
  toggleMobileMenu: () => set((s) => ({ mobileMenuOpen: !s.mobileMenuOpen })),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),
}));

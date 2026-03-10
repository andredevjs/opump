/**
 * Wallet provider wrapper.
 * Wraps with WalletConnectProvider and syncs state to Zustand.
 */

import { lazy, Suspense, type ReactNode } from 'react';

interface WalletProviderProps {
  children: ReactNode;
}

// Lazy-load the real provider so walletconnect bundle is code-split
const RealWalletProvider = lazy(() => import('./RealWalletProvider'));

export function WalletProvider({ children }: WalletProviderProps) {
  return (
    <Suspense fallback={null}>
      <RealWalletProvider>{children}</RealWalletProvider>
    </Suspense>
  );
}

/**
 * Wallet hook.
 * Returns wallet state from the Zustand store.
 *
 * In mock mode: store.connect() uses hardcoded test values.
 * In real mode: WalletBridge (in RealWalletProvider) syncs walletconnect -> store,
 * and store.connect() triggers openConnectModal() via the registered bridge.
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { clearContractCache } from '@/services/contract';
import { useWalletStore } from '@/stores/wallet-store';

interface WalletHookResult {
  connected: boolean;
  address: string | null;
  network: string | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: (network: string) => void;
}

export function useWallet(): WalletHookResult {
  const { connected, address, network, isConnecting, connect, disconnect } = useWalletStore(
    useShallow((s) => ({
      connected: s.connected,
      address: s.address,
      network: s.network,
      isConnecting: s.isConnecting,
      connect: s.connect,
      disconnect: s.disconnect,
    })),
  );

  const switchNetwork = useCallback((net: string) => {
    clearContractCache();
    useWalletStore.setState({ network: net });
  }, []);

  return {
    connected,
    address,
    network,
    isConnecting,
    connect,
    disconnect,
    switchNetwork,
  };
}

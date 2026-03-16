/**
 * WalletConnect integration for real (non-mock) mode.
 * Wraps children in WalletConnectProvider and bridges state to Zustand.
 */

import { useEffect, type ReactNode } from 'react';
import { WalletConnectProvider, useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { useWalletStore, setWalletConnectBridge, clearWalletConnectBridge } from '@/stores/wallet-store';
import { clearContractCache } from '@/services/contract';

interface Props {
  children: ReactNode;
}

/**
 * Bridge component that lives inside WalletConnectProvider.
 * Syncs walletconnect context state → Zustand wallet store.
 */
function WalletBridge() {
  const {
    walletAddress,
    walletBalance,
    network,
    hashedMLDSAKey,
    publicKey,
    connectToWallet,
    disconnect: wcDisconnect,
  } = useWalletConnect();

  const syncWallet = useWalletStore((s) => s.syncWallet);

  // Sync walletconnect state → Zustand on every relevant change
  useEffect(() => {
    syncWallet({
      connected: !!walletAddress,
      address: walletAddress ?? null,
      hashedMLDSAKey: hashedMLDSAKey ?? null,
      publicKey: publicKey ?? null,
      balanceSats: walletBalance?.total ?? 0,
      network: network?.network ?? null,
    });
  }, [walletAddress, walletBalance, network, hashedMLDSAKey, publicKey, syncWallet]);

  // S25: Register the bridge so store.connect() connects directly to OP Wallet, with cleanup
  useEffect(() => {
    setWalletConnectBridge(() => connectToWallet(SupportedWallets.OP_WALLET));
    return () => clearWalletConnectBridge();
  }, [connectToWallet]);

  // Wire store.disconnect() to also call walletconnect disconnect
  useEffect(() => {
    const unsub = useWalletStore.subscribe((state, prevState) => {
      // Detect when disconnect was triggered from our store
      if (prevState.connected && !state.connected && walletAddress) {
        clearContractCache();
        wcDisconnect();
      }
    });
    return unsub;
  }, [wcDisconnect, walletAddress]);

  return null;
}

export default function RealWalletProvider({ children }: Props) {
  return (
    <WalletConnectProvider theme="dark">
      <WalletBridge />
      {children}
    </WalletConnectProvider>
  );
}

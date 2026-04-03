import { create } from 'zustand';
import { clearContractCache } from '@/services/contract';

/**
 * Bridge function set by the WalletConnectProvider integration.
 * In real mode, a component using useWalletConnect() registers itself here
 * so the Zustand store can trigger wallet connection.
 */
let _walletBridge: (() => void) | null = null;
export function setWalletConnectBridge(openConnect: () => void): void {
  _walletBridge = openConnect;
}
export function clearWalletConnectBridge(): void {
  _walletBridge = null;
}

interface WalletSyncData {
  address: string | null;
  balanceSats: number;
  network: string | null;
  connected: boolean;
  hashedMLDSAKey?: string | null;
  publicKey?: string | null;
}

interface WalletStore {
  connected: boolean;
  address: string | null;
  /** The 0x-prefixed OP_20 address (SHA256 of ML-DSA key). This is the
   *  canonical OPNet identity shown in on-chain events, token balances,
   *  and trade history. Derived from hashedMLDSAKey. */
  opAddress: string | null;
  /** Hashed ML-DSA public key (hex) — first param for Address.fromString() */
  hashedMLDSAKey: string | null;
  /** Classical public key (hex) — second param for Address.fromString() */
  publicKey: string | null;
  balanceSats: number;
  network: string | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Sync wallet state from WalletConnectProvider context */
  syncWallet: (data: WalletSyncData) => void;
}

export const useWalletStore = create<WalletStore>((set, get) => ({
  connected: false,
  address: null,
  opAddress: null,
  hashedMLDSAKey: null,
  publicKey: null,
  balanceSats: 0,
  network: null,
  isConnecting: false,

  connect: async () => {
    if (get().isConnecting) return;

    // Trigger the WalletConnectProvider modal.
    // The actual state sync happens via syncWallet() called from the bridge component.
    set({ isConnecting: true });
    if (_walletBridge) {
      _walletBridge();
      setTimeout(() => {
        if (get().isConnecting) set({ isConnecting: false });
      }, 30_000);
    } else {
      console.error('[Wallet] No wallet bridge registered. Wrap app in WalletConnectProvider.');
      set({ isConnecting: false });
    }
  },

  syncWallet: (data) => {
    // hashedMLDSAKey is already the 0x-prefixed SHA256 of the ML-DSA key,
    // which is the canonical OP_20 identity used on-chain.
    const mldsaKey = data.hashedMLDSAKey ?? null;
    const opAddr = mldsaKey
      ? (mldsaKey.startsWith('0x') ? mldsaKey : `0x${mldsaKey}`)
      : null;
    set({
      connected: data.connected,
      address: data.address,
      opAddress: opAddr,
      hashedMLDSAKey: mldsaKey,
      publicKey: data.publicKey ?? null,
      balanceSats: Math.max(0, Math.floor(data.balanceSats)),
      network: data.network,
      isConnecting: false,
    });

    // Fire-and-forget: link referral code if one was captured from URL
    if (data.connected && opAddr) {
      const refCode = localStorage.getItem('opump_ref');
      if (refCode) {
        import('@/stores/referral-store').then(({ useReferralStore }) => {
          useReferralStore.getState().linkReferral(opAddr!, refCode).finally(() => {
            localStorage.removeItem('opump_ref');
          });
        }).catch(() => {
          // Referral linking is best-effort
        });
      }
    }
  },

  disconnect: () => {
    clearContractCache();
    set({
      connected: false,
      address: null,
      opAddress: null,
      hashedMLDSAKey: null,
      publicKey: null,
      balanceSats: 0,
      network: null,
      isConnecting: false,
    });
  },

}));

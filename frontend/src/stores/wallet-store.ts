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
    set({
      connected: data.connected,
      address: data.address,
      hashedMLDSAKey: data.hashedMLDSAKey ?? null,
      publicKey: data.publicKey ?? null,
      balanceSats: Math.max(0, Math.floor(data.balanceSats)),
      network: data.network,
      isConnecting: false,
    });

    // Fire-and-forget: link referral code if one was captured from URL
    if (data.connected && data.address) {
      const refCode = localStorage.getItem('opump_ref');
      if (refCode) {
        import('@/stores/referral-store').then(({ useReferralStore }) => {
          useReferralStore.getState().linkReferral(data.address!, refCode).finally(() => {
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
      hashedMLDSAKey: null,
      publicKey: null,
      balanceSats: 0,
      network: null,
      isConnecting: false,
    });
  },

}));

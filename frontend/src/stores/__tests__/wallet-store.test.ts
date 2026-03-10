import { describe, it, expect, beforeEach } from 'vitest';
import { useWalletStore } from '../wallet-store';

function resetStore() {
  useWalletStore.setState({
    connected: false,
    address: null,
    balanceSats: 0,
    network: null,
    isConnecting: false,
  });
}

describe('wallet-store', () => {
  beforeEach(resetStore);

  describe('balance management', () => {
    it('deducts balance', () => {
      useWalletStore.setState({ balanceSats: 1_000_000 });
      useWalletStore.getState().deductBalance(250_000);

      expect(useWalletStore.getState().balanceSats).toBe(750_000);
    });

    it('clamps balance at zero on over-deduction', () => {
      useWalletStore.setState({ balanceSats: 100 });
      useWalletStore.getState().deductBalance(500);

      expect(useWalletStore.getState().balanceSats).toBe(0);
    });

    it('adds balance', () => {
      useWalletStore.setState({ balanceSats: 1_000_000 });
      useWalletStore.getState().addBalance(500_000);

      expect(useWalletStore.getState().balanceSats).toBe(1_500_000);
    });

    it('handles adding to zero balance', () => {
      useWalletStore.getState().addBalance(100_000);

      expect(useWalletStore.getState().balanceSats).toBe(100_000);
    });
  });

  describe('setAddress', () => {
    it('updates the address', () => {
      useWalletStore.getState().setAddress('bc1qnew');

      expect(useWalletStore.getState().address).toBe('bc1qnew');
    });
  });

  describe('setBalance', () => {
    it('sets absolute balance', () => {
      useWalletStore.getState().setBalance(999_999);

      expect(useWalletStore.getState().balanceSats).toBe(999_999);
    });
  });

  describe('disconnect', () => {
    it('resets all wallet state', () => {
      useWalletStore.setState({
        connected: true,
        address: 'bc1qtest',
        balanceSats: 1_000_000,
        network: 'testnet',
      });

      useWalletStore.getState().disconnect();

      const state = useWalletStore.getState();
      expect(state.connected).toBe(false);
      expect(state.address).toBeNull();
      expect(state.balanceSats).toBe(0);
      expect(state.network).toBeNull();
      expect(state.isConnecting).toBe(false);
    });
  });
});

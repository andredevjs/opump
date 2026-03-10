/**
 * Contract interaction hooks for buy/sell operations.
 * Provides React-friendly wrappers around typed contract calls.
 *
 * NOTE: For the full trade flow (simulation + execution + optimistic UI updates),
 * use useTradeSimulation instead. These hooks are lower-level wrappers for
 * direct contract calls without the surrounding UX logic.
 */

import { useState, useCallback, useMemo } from 'react';
import { getLaunchTokenContract, sendContractCall, setupPayableCall } from '@/services/contract';
import type { TransactionReceipt } from '@/services/contract';
import { useWalletStore } from '@/stores/wallet-store';

type LaunchTokenInstance = ReturnType<typeof getLaunchTokenContract>;

/**
 * Get a cached contract instance for a token.
 */
export function useTokenContract(address: string | null): LaunchTokenInstance | null {
  return useMemo(() => {
    if (!address) return null;
    try {
      return getLaunchTokenContract(address);
    } catch (err) {
      console.error('[Contract] Failed to get contract:', err);
      return null;
    }
  }, [address]);
}

/**
 * Hook for buying tokens via contract.
 * Simulates then sends with signer: null (OPWallet signs).
 */
export function useBuy(tokenAddress: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address: walletAddress } = useWalletStore();

  const buy = useCallback(
    async (btcAmountSats: bigint): Promise<TransactionReceipt | null> => {
      if (!tokenAddress || !walletAddress) return null;

      setIsLoading(true);
      setError(null);

      try {
        const contract = getLaunchTokenContract(tokenAddress);
        // @payable: declare the BTC output BEFORE simulate
        setupPayableCall(contract, tokenAddress, btcAmountSats);
        const sim = await contract.buy(btcAmountSats);
        const result = await sendContractCall(sim, {
          refundTo: walletAddress,
          maximumAllowedSatToSpend: btcAmountSats + 50000n,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Buy failed';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [tokenAddress, walletAddress],
  );

  return { buy, isLoading, error };
}

/**
 * Hook for selling tokens via contract.
 * Simulates then sends with signer: null (OPWallet signs).
 */
export function useSell(tokenAddress: string | null) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { address: walletAddress } = useWalletStore();

  const sell = useCallback(
    async (tokenAmount: bigint): Promise<TransactionReceipt | null> => {
      if (!tokenAddress || !walletAddress) return null;

      setIsLoading(true);
      setError(null);

      try {
        const contract = getLaunchTokenContract(tokenAddress);
        const sim = await contract.sell(tokenAmount);
        const result = await sendContractCall(sim, {
          refundTo: walletAddress,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sell failed';
        setError(msg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [tokenAddress, walletAddress],
  );

  return { sell, isLoading, error };
}

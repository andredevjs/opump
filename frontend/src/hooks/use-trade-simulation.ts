import { useState, useCallback, useRef, useEffect } from 'react';
import type { Token } from '@/types/token';
import type { PendingTransaction, TradeSimulation } from '@/types/trade';
import { useBondingCurve } from './use-bonding-curve';
import { useWalletStore } from '@/stores/wallet-store';
import { useTradeStore } from '@/stores/trade-store';
import toast from 'react-hot-toast';

// The vault address where BTC must be sent for @payable buy() calls.
// Each LaunchToken stores this as its vault — currently always the factory address.
const VAULT_ADDRESS = import.meta.env.VITE_FACTORY_ADDRESS || '';

export function useTradeSimulation(token: Token | null) {
  const { simulateBuy: localSimBuy, simulateSell: localSimSell } = useBondingCurve(token);
  const { connected, address: walletAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const { deductBalance, addBalance } = useWalletStore();
  const { addPending, updatePendingStatus, removePending, addHolding, removeHolding } = useTradeStore();
  const [executing, setExecuting] = useState(false);

  // Extract stable primitives to avoid re-creating callbacks when token object ref changes
  const tokenAddress = token?.address;
  const tokenSymbol = token?.symbol;

  // Track pending timeouts for cleanup on unmount
  const timeoutIds = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      for (const id of timeoutIds.current) clearTimeout(id);
      timeoutIds.current.clear();
    };
  }, []);

  function scheduleTimeout(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      timeoutIds.current.delete(id);
      fn();
    }, ms);
    timeoutIds.current.add(id);
  }

  /**
   * Simulate a buy. Uses local BigNumber math for instant preview.
   */
  const simulateBuy = useCallback(
    (btcSats: string): TradeSimulation | null => {
      return localSimBuy(btcSats);
    },
    [localSimBuy],
  );

  /**
   * Simulate a sell using local bonding curve math.
   */
  const simulateSell = useCallback(
    (tokenUnits: string): TradeSimulation | null => {
      return localSimSell(tokenUnits);
    },
    [localSimSell],
  );

  /**
   * Execute a buy transaction via contract call through OPWallet.
   */
  const executeBuy = useCallback(
    async (btcSats: string) => {
      if (!tokenAddress || !connected || !btcSats || btcSats === '0') return;
      if (!walletAddress) {
        toast.error('Wallet not connected');
        return;
      }
      const sim = simulateBuy(btcSats);
      if (!sim) return;

      setExecuting(true);
      const txId = `tx-${Date.now()}-${crypto.randomUUID()}`;
      const btcSatsNum = Number(btcSats);

      const pending: PendingTransaction = {
        id: txId,
        type: 'buy',
        status: 'broadcasted',
        btcAmount: btcSatsNum,
        tokenAmount: sim.outputAmount,
        tokenSymbol: tokenSymbol ?? '',
        tokenAddress: tokenAddress,
        timestamp: Date.now(),
      };

      addPending(pending);
      deductBalance(btcSatsNum);
      toast.success(`Buy broadcasted: ${(btcSatsNum / 100_000_000).toFixed(6)} BTC`);

      try {
        const { getLaunchTokenContract, sendContractCall, setupPayableCall, waitForConfirmation } = await import('@/services/contract');
        const { Address } = await import('@btc-vision/transaction');
        const contract = getLaunchTokenContract(tokenAddress);
        const btcSatsBigInt = BigInt(btcSats);

        if (btcSatsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('Amount exceeds safe range for extra outputs');
        }

        // Set sender so the contract simulation knows who the caller is
        if (hashedMLDSAKey) {
          contract.setSender(Address.fromString(hashedMLDSAKey, publicKey ?? undefined));
        }

        // @payable: declare the BTC output to the vault BEFORE simulate
        setupPayableCall(contract, VAULT_ADDRESS, btcSatsBigInt);

        const simResult = await contract.buy(btcSatsBigInt);
        const result = await sendContractCall(simResult, {
          refundTo: walletAddress,
          maximumAllowedSatToSpend: btcSatsBigInt + 50000n,
          extraOutputs: [{ address: VAULT_ADDRESS, value: Number(btcSatsBigInt) }],
        });

        updatePendingStatus(txId, 'mempool');
        toast(`Buy detected in mempool`, { icon: '📡' });

        await waitForConfirmation(result.txHash);
        updatePendingStatus(txId, 'confirmed');
        addHolding(tokenAddress, sim.outputAmount);
        toast.success(`Buy confirmed! TX: ${result.txHash.slice(0, 12)}...`);
        setExecuting(false);
        scheduleTimeout(() => removePending(txId), 5000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Buy failed');
        addBalance(btcSatsNum); // Refund on failure
        removePending(txId);
        setExecuting(false);
      }
    },
    [tokenAddress, tokenSymbol, connected, walletAddress, simulateBuy],
  );

  /**
   * Execute a sell transaction.
   */
  const executeSell = useCallback(
    async (tokenUnits: string) => {
      if (!tokenAddress || !connected || !tokenUnits || tokenUnits === '0') return;
      if (!walletAddress) {
        toast.error('Wallet not connected');
        return;
      }
      const sim = simulateSell(tokenUnits);
      if (!sim) return;

      setExecuting(true);
      const txId = `tx-${Date.now()}-${crypto.randomUUID()}`;

      const pending: PendingTransaction = {
        id: txId,
        type: 'sell',
        status: 'broadcasted',
        btcAmount: Number(sim.outputAmount),
        tokenAmount: tokenUnits,
        tokenSymbol: tokenSymbol ?? '',
        tokenAddress: tokenAddress,
        timestamp: Date.now(),
      };

      addPending(pending);
      removeHolding(tokenAddress, tokenUnits);
      toast.success(`Sell broadcasted`);

      try {
        const { getLaunchTokenContract, sendContractCall, waitForConfirmation } = await import('@/services/contract');
        const { Address } = await import('@btc-vision/transaction');
        const contract = getLaunchTokenContract(tokenAddress);

        // Set sender so the contract simulation knows who the caller is
        if (hashedMLDSAKey) {
          contract.setSender(Address.fromString(hashedMLDSAKey, publicKey ?? undefined));
        }

        const simResult = await contract.sell(BigInt(tokenUnits));
        const result = await sendContractCall(simResult, {
          refundTo: walletAddress,
        });

        updatePendingStatus(txId, 'mempool');
        toast(`Sell detected in mempool`, { icon: '📡' });

        await waitForConfirmation(result.txHash);
        updatePendingStatus(txId, 'confirmed');
        addBalance(Number(sim.outputAmount));
        toast.success(`Sell confirmed! TX: ${result.txHash.slice(0, 12)}...`);
        setExecuting(false);
        scheduleTimeout(() => removePending(txId), 5000);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Sell failed');
        addHolding(tokenAddress, tokenUnits); // Refund on failure
        removePending(txId);
        setExecuting(false);
      }
    },
    [tokenAddress, tokenSymbol, connected, walletAddress, simulateSell],
  );

  return { simulateBuy, simulateSell, executeBuy, executeSell, executing };
}

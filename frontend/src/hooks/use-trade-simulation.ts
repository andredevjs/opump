import { useState, useCallback, useRef, useEffect } from 'react';
import type { Token } from '@/types/token';
import type { PendingTransaction } from '@/types/trade';
import { useBondingCurve } from './use-bonding-curve';
import { useWalletStore } from '@/stores/wallet-store';
import { useTradeStore } from '@/stores/trade-store';
import { VAULT_ADDRESS } from '@/config/constants';
import toast from 'react-hot-toast';

export function useTradeSimulation(token: Token | null) {
  const { simulateBuy: localSimBuy, simulateSell: localSimSell } = useBondingCurve(token);
  const { connected, address: walletAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const { deductBalance, addBalance } = useWalletStore();
  const { addPending, updatePendingStatus, removePending, addHolding, removeHolding, addLocalTrade, confirmLocalTrade } = useTradeStore();
  const [executing, setExecuting] = useState(false);

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

  // S20: simulateBuy / simulateSell are the bonding-curve functions directly
  const simulateBuy = localSimBuy;
  const simulateSell = localSimSell;

  /**
   * Execute a buy transaction via contract call through OPWallet.
   */
  const executeBuy = useCallback(
    async (btcSats: string) => {
      // F3: Guard against missing vault address
      if (!VAULT_ADDRESS) {
        toast.error('Factory address not configured');
        return;
      }
      if (!tokenAddress || !connected || !btcSats || btcSats === '0') return;
      if (!walletAddress) {
        toast.error('Wallet not connected');
        return;
      }

      // W13: Validate BigInt range before any state mutations
      const btcSatsBigInt = BigInt(btcSats);
      if (btcSatsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
        toast.error('Amount exceeds safe range for extra outputs');
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
          extraOutputs: [{ address: VAULT_ADDRESS, value: btcSatsBigInt }],
        });

        updatePendingStatus(txId, 'mempool');

        addLocalTrade(tokenAddress, {
          txHash: result.txHash,
          type: 'buy',
          traderAddress: walletAddress,
          btcAmount: btcSats,
          tokenAmount: sim.outputAmount,
          status: 'pending',
          pricePerToken: String(sim.newPriceSats),
        });

        try {
          const { submitTrade } = await import('@/services/api');
          await submitTrade({
            txHash: result.txHash,
            tokenAddress,
            type: 'buy',
            traderAddress: walletAddress,
            btcAmount: btcSats,
            tokenAmount: sim.outputAmount,
            pricePerToken: String(sim.newPriceSats),
          });
        } catch {
          // Best effort — mempool scanner will pick it up
        }

        toast(`Buy detected in mempool`, { icon: '\u{1F4E1}' });

        await waitForConfirmation(result.txHash);
        updatePendingStatus(txId, 'confirmed');
        confirmLocalTrade(tokenAddress, result.txHash);
        addHolding(tokenAddress, sim.outputAmount);
        toast.success(`Buy confirmed! TX: ${result.txHash.slice(0, 12)}...`);
        setExecuting(false);
        scheduleTimeout(() => removePending(txId), 5000);

        // Nudge the indexer to pick up the confirmed block — don't refetch token
        // data because optimistic updates already updated price, trades, and chart.
        // Calling fetchToken() here would race with the indexer and overwrite
        // the optimistic price with stale DB data.
        import('@/services/api').then(({ triggerIndexer }) => triggerIndexer());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Buy failed');
        addBalance(btcSatsNum); // Refund on failure
        removePending(txId);
        setExecuting(false);
      }
    },
    [tokenAddress, tokenSymbol, connected, walletAddress, hashedMLDSAKey, publicKey, simulateBuy,
     addPending, deductBalance, updatePendingStatus, addLocalTrade, confirmLocalTrade, addHolding, removePending, addBalance],
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

        addLocalTrade(tokenAddress, {
          txHash: result.txHash,
          type: 'sell',
          traderAddress: walletAddress,
          btcAmount: sim.outputAmount,
          tokenAmount: tokenUnits,
          status: 'pending',
          pricePerToken: String(sim.newPriceSats),
        });

        try {
          const { submitTrade } = await import('@/services/api');
          await submitTrade({
            txHash: result.txHash,
            tokenAddress,
            type: 'sell',
            traderAddress: walletAddress,
            btcAmount: sim.outputAmount,
            tokenAmount: tokenUnits,
            pricePerToken: String(sim.newPriceSats),
          });
        } catch {
          // Best effort — mempool scanner will pick it up
        }

        toast(`Sell detected in mempool`, { icon: '\u{1F4E1}' });

        await waitForConfirmation(result.txHash);
        updatePendingStatus(txId, 'confirmed');
        confirmLocalTrade(tokenAddress, result.txHash);
        addBalance(Number(sim.outputAmount));
        toast.success(`Sell confirmed! TX: ${result.txHash.slice(0, 12)}...`);
        setExecuting(false);
        scheduleTimeout(() => removePending(txId), 5000);

        // Nudge the indexer to pick up the confirmed block — don't refetch token
        // data because optimistic updates already updated price, trades, and chart.
        import('@/services/api').then(({ triggerIndexer }) => triggerIndexer());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Sell failed');
        addHolding(tokenAddress, tokenUnits); // Refund on failure
        removePending(txId);
        setExecuting(false);
      }
    },
    [tokenAddress, tokenSymbol, connected, walletAddress, hashedMLDSAKey, publicKey, simulateSell,
     addPending, removeHolding, updatePendingStatus, addLocalTrade, confirmLocalTrade, addBalance, addHolding, removePending],
  );

  return { simulateBuy, simulateSell, executeBuy, executeSell, executing };
}

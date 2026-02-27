import { useState, useCallback } from 'react';
import type { Token } from '@/types/token';
import type { PendingTransaction, TradeSimulation } from '@/types/trade';
import { useBondingCurve } from './use-bonding-curve';
import { useWalletStore } from '@/stores/wallet-store';
import { useTradeStore } from '@/stores/trade-store';
import { TX_MEMPOOL_DELAY_MS, TX_CONFIRM_DELAY_MS } from '@/config/constants';
import toast from 'react-hot-toast';

export function useTradeSimulation(token: Token | null) {
  const { simulateBuy, simulateSell } = useBondingCurve(token);
  const { connected } = useWalletStore();
  const { deductBalance, addBalance } = useWalletStore();
  const { addPending, updatePendingStatus, removePending, addHolding, removeHolding } = useTradeStore();
  const [executing, setExecuting] = useState(false);

  const executeBuy = useCallback(
    async (btcSats: number) => {
      if (!token || !connected || btcSats <= 0) return;
      const sim = simulateBuy(btcSats);
      if (!sim) return;

      setExecuting(true);
      const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const pending: PendingTransaction = {
        id: txId,
        type: 'buy',
        status: 'broadcasted',
        btcAmount: btcSats,
        tokenAmount: sim.outputAmount,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        timestamp: Date.now(),
      };

      addPending(pending);
      deductBalance(btcSats);
      toast.success(`Buy broadcasted: ${(btcSats / 100_000_000).toFixed(6)} BTC`);

      // Mempool after 2s
      setTimeout(() => {
        updatePendingStatus(txId, 'mempool');
        toast(`Buy detected in mempool`, { icon: '📡' });
      }, TX_MEMPOOL_DELAY_MS);

      // Confirmed after 15s
      setTimeout(() => {
        updatePendingStatus(txId, 'confirmed');
        addHolding(token.address, sim.outputAmount);
        toast.success(`Buy confirmed!`);
        setExecuting(false);

        // Remove from pending after showing confirmed state
        setTimeout(() => removePending(txId), 5000);
      }, TX_CONFIRM_DELAY_MS);
    },
    [token, connected, simulateBuy],
  );

  const executeSell = useCallback(
    async (tokenUnits: number) => {
      if (!token || !connected || tokenUnits <= 0) return;
      const sim = simulateSell(tokenUnits);
      if (!sim) return;

      setExecuting(true);
      const txId = `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const pending: PendingTransaction = {
        id: txId,
        type: 'sell',
        status: 'broadcasted',
        btcAmount: sim.outputAmount,
        tokenAmount: tokenUnits,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
        timestamp: Date.now(),
      };

      addPending(pending);
      removeHolding(token.address, tokenUnits);
      toast.success(`Sell broadcasted`);

      setTimeout(() => {
        updatePendingStatus(txId, 'mempool');
        toast(`Sell detected in mempool`, { icon: '📡' });
      }, TX_MEMPOOL_DELAY_MS);

      setTimeout(() => {
        updatePendingStatus(txId, 'confirmed');
        addBalance(sim.outputAmount);
        toast.success(`Sell confirmed!`);
        setExecuting(false);
        setTimeout(() => removePending(txId), 5000);
      }, TX_CONFIRM_DELAY_MS);
    },
    [token, connected, simulateSell],
  );

  return { simulateBuy, simulateSell, executeBuy, executeSell, executing };
}

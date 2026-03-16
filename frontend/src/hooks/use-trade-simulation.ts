import { useState, useCallback, useRef, useEffect } from 'react';
import type { Token } from '@/types/token';
import type { PendingTransaction } from '@/types/trade';
import { useBondingCurve } from './use-bonding-curve';
import { useWalletStore } from '@/stores/wallet-store';
import { useTradeStore } from '@/stores/trade-store';
import { VAULT_ADDRESS } from '@/config/constants';
import { computeOptimistic24hChange } from '@/lib/price-utils';
import toast from 'react-hot-toast';

export function useTradeSimulation(token: Token | null) {
  const { simulateBuy: localSimBuy, simulateSell: localSimSell } = useBondingCurve(token);
  const { connected, address: walletAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const { deductBalance, addBalance } = useWalletStore();
  const { addPending, updatePendingStatus, removePending, addHolding, removeHolding, addWsTrade, confirmWsTrade } = useTradeStore();
  const [executing, setExecuting] = useState(false);

  // Extract stable primitives to avoid re-creating callbacks when token object ref changes
  const tokenAddress = token?.address;
  const tokenSymbol = token?.symbol;
  // W6-W7: Extract realBtcReserve so it can be a dependency
  const realBtcReserve = token?.realBtcReserve;

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

        // Optimistic trade entry — appears instantly in TradeHistory
        addWsTrade(tokenAddress, {
          txHash: result.txHash,
          type: 'buy',
          traderAddress: walletAddress,
          btcAmount: btcSats,
          tokenAmount: sim.outputAmount,
          status: 'pending',
          pricePerToken: String(sim.pricePerToken),
        });

        // Submit trade to Redis so ALL users see it immediately
        import('@/services/api').then(({ submitTrade }) => {
          submitTrade({
            txHash: result.txHash,
            tokenAddress,
            type: 'buy',
            traderAddress: walletAddress,
            btcAmount: btcSats,
            tokenAmount: sim.outputAmount,
            pricePerToken: String(sim.pricePerToken),
          });
        });

        // Optimistic price update from simulation
        const { usePriceStore } = await import('@/stores/price-store');
        const { useTokenStore } = await import('@/stores/token-store');
        usePriceStore.getState().setLivePrice(tokenAddress, {
          currentPriceSats: String(sim.newPriceSats),
          virtualBtcReserve: sim.newVirtualBtc,
          virtualTokenSupply: sim.newVirtualToken,
          realBtcReserve: realBtcReserve ?? '0',
          isOptimistic: true,
        });
        const currentToken = useTokenStore.getState().selectedToken;
        const oldPrice = currentToken?.address === tokenAddress ? currentToken.currentPriceSats : 0;
        const oldChange = currentToken?.address === tokenAddress ? currentToken.priceChange24h : 0;
        const newChange = computeOptimistic24hChange(oldPrice, oldChange, sim.newPriceSats);
        useTokenStore.getState().updateTokenPrice(tokenAddress, sim.newPriceSats, newChange);

        // Optimistic chart candle update so the trade shows on the chart immediately
        usePriceStore.getState().addTradeCandle(tokenAddress, sim.newPriceSats, Number(btcSats));

        toast(`Buy detected in mempool`, { icon: '\u{1F4E1}' });

        await waitForConfirmation(result.txHash);
        updatePendingStatus(txId, 'confirmed');
        confirmWsTrade(tokenAddress, result.txHash);
        addHolding(tokenAddress, sim.outputAmount);
        toast.success(`Buy confirmed! TX: ${result.txHash.slice(0, 12)}...`);
        setExecuting(false);
        scheduleTimeout(() => removePending(txId), 5000);

        // Nudge the indexer to pick up the confirmed block — don't refetch token
        // data because WebSocket events already updated price, trades, and chart.
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
     realBtcReserve, addPending, deductBalance, updatePendingStatus, addWsTrade, confirmWsTrade, addHolding, removePending, addBalance],
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

        // Optimistic trade entry — appears instantly in TradeHistory
        addWsTrade(tokenAddress, {
          txHash: result.txHash,
          type: 'sell',
          traderAddress: walletAddress,
          btcAmount: sim.outputAmount,
          tokenAmount: tokenUnits,
          status: 'pending',
          pricePerToken: String(sim.pricePerToken),
        });

        // Submit trade to Redis so ALL users see it immediately
        import('@/services/api').then(({ submitTrade }) => {
          submitTrade({
            txHash: result.txHash,
            tokenAddress,
            type: 'sell',
            traderAddress: walletAddress,
            btcAmount: sim.outputAmount,
            tokenAmount: tokenUnits,
            pricePerToken: String(sim.pricePerToken),
          });
        });

        // Optimistic price update from simulation
        const { usePriceStore } = await import('@/stores/price-store');
        const { useTokenStore } = await import('@/stores/token-store');
        usePriceStore.getState().setLivePrice(tokenAddress, {
          currentPriceSats: String(sim.newPriceSats),
          virtualBtcReserve: sim.newVirtualBtc,
          virtualTokenSupply: sim.newVirtualToken,
          realBtcReserve: realBtcReserve ?? '0',
          isOptimistic: true,
        });
        const currentTokenSell = useTokenStore.getState().selectedToken;
        const oldPriceSell = currentTokenSell?.address === tokenAddress ? currentTokenSell.currentPriceSats : 0;
        const oldChangeSell = currentTokenSell?.address === tokenAddress ? currentTokenSell.priceChange24h : 0;
        const newChangeSell = computeOptimistic24hChange(oldPriceSell, oldChangeSell, sim.newPriceSats);
        useTokenStore.getState().updateTokenPrice(tokenAddress, sim.newPriceSats, newChangeSell);

        // Optimistic chart candle update so the trade shows on the chart immediately
        usePriceStore.getState().addTradeCandle(tokenAddress, sim.newPriceSats, Number(sim.outputAmount));

        toast(`Sell detected in mempool`, { icon: '\u{1F4E1}' });

        await waitForConfirmation(result.txHash);
        updatePendingStatus(txId, 'confirmed');
        confirmWsTrade(tokenAddress, result.txHash);
        addBalance(Number(sim.outputAmount));
        toast.success(`Sell confirmed! TX: ${result.txHash.slice(0, 12)}...`);
        setExecuting(false);
        scheduleTimeout(() => removePending(txId), 5000);

        // Nudge the indexer to pick up the confirmed block — don't refetch token
        // data because WebSocket events already updated price, trades, and chart.
        import('@/services/api').then(({ triggerIndexer }) => triggerIndexer());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Sell failed');
        addHolding(tokenAddress, tokenUnits); // Refund on failure
        removePending(txId);
        setExecuting(false);
      }
    },
    [tokenAddress, tokenSymbol, connected, walletAddress, hashedMLDSAKey, publicKey, simulateSell,
     realBtcReserve, addPending, removeHolding, updatePendingStatus, addWsTrade, confirmWsTrade, addBalance, addHolding, removePending],
  );

  return { simulateBuy, simulateSell, executeBuy, executeSell, executing };
}

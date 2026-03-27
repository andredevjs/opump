import { useState, useCallback, useRef } from 'react';
import type { Token } from '@/types/token';
import { useBondingCurve } from './use-bonding-curve';
import { useWalletStore } from '@/stores/wallet-store';
import { useUIStore } from '@/stores/ui-store';
import { saveKnownAddress } from '@/lib/known-tokens';
import { VAULT_ADDRESS } from '@/config/constants';
import { submitTrade, triggerIndexer } from '@/services/api';
import { hexAddressToBech32m } from '@/utils/address';
import toast from 'react-hot-toast';

export function useTradeSimulation(token: Token | null) {
  const { simulateBuy: localSimBuy, simulateSell: localSimSell } = useBondingCurve(token);
  const { connected, address: walletAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const bumpTradeVersion = useUIStore((s) => s.bumpTradeVersion);
  const [executing, setExecuting] = useState(false);
  const executingRef = useRef(false);

  const tokenAddress = token?.address;

  // S20: simulateBuy / simulateSell are the bonding-curve functions directly
  const simulateBuy = localSimBuy;
  const simulateSell = localSimSell;

  /**
   * Execute a buy transaction via contract call through OPWallet.
   */
  const executeBuy = useCallback(
    async (btcSats: string) => {
      if (executingRef.current) return;
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

      executingRef.current = true;
      setExecuting(true);

      try {
        const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
        const { Address } = await import('@btc-vision/transaction');
        const contract = getLaunchTokenContract(tokenAddress);

        // Set sender so the contract simulation knows who the caller is
        if (hashedMLDSAKey) {
          contract.setSender(Address.fromString(hashedMLDSAKey, publicKey ?? undefined));
        }

        // @payable: declare the BTC output to the vault BEFORE simulate
        const { setupPayableCall } = await import('@/services/contract');
        setupPayableCall(contract, VAULT_ADDRESS, btcSatsBigInt);

        const simResult = await contract.buy(btcSatsBigInt);
        const result = await sendContractCall(simResult, {
          refundTo: walletAddress,
          maximumAllowedSatToSpend: btcSatsBigInt + 50000n,
          extraOutputs: [{ address: VAULT_ADDRESS, value: btcSatsBigInt }],
        });

        // Derive canonical traderAddress from hashedMLDSAKey to match indexer's on-chain derivation
        const { networks } = await import('@btc-vision/bitcoin');
        const net = import.meta.env.VITE_OPNET_NETWORK || 'testnet';
        const network = net === 'mainnet' ? networks.bitcoin : net === 'regtest' ? networks.regtest : networks.opnetTestnet;
        const traderAddr = hashedMLDSAKey ? hexAddressToBech32m(hashedMLDSAKey, network) : walletAddress;

        await submitTrade({
          txHash: result.txHash,
          tokenAddress,
          type: 'buy',
          traderAddress: traderAddr,
          btcAmount: btcSats,
          tokenAmount: sim.outputAmount,
          pricePerToken: String(sim.newPriceSats),
        });

        saveKnownAddress(tokenAddress);
        bumpTradeVersion();

        // Nudge the indexer — fire-and-forget
        triggerIndexer();

        toast.success(`Buy submitted! TX: ${result.txHash.slice(0, 12)}...`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Buy failed');
      } finally {
        executingRef.current = false;
        setExecuting(false);
      }
    },
    [tokenAddress, connected, walletAddress, hashedMLDSAKey, publicKey, simulateBuy, bumpTradeVersion],
  );

  /**
   * Execute a sell transaction.
   */
  const executeSell = useCallback(
    async (tokenUnits: string) => {
      if (executingRef.current) return;
      if (!tokenAddress || !connected || !tokenUnits || tokenUnits === '0') return;
      if (!walletAddress) {
        toast.error('Wallet not connected');
        return;
      }
      const sim = simulateSell(tokenUnits);
      if (!sim) return;

      executingRef.current = true;
      setExecuting(true);

      try {
        const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
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

        // Derive canonical traderAddress from hashedMLDSAKey to match indexer's on-chain derivation
        const { networks } = await import('@btc-vision/bitcoin');
        const net = import.meta.env.VITE_OPNET_NETWORK || 'testnet';
        const network = net === 'mainnet' ? networks.bitcoin : net === 'regtest' ? networks.regtest : networks.opnetTestnet;
        const traderAddr = hashedMLDSAKey ? hexAddressToBech32m(hashedMLDSAKey, network) : walletAddress;

        await submitTrade({
          txHash: result.txHash,
          tokenAddress,
          type: 'sell',
          traderAddress: traderAddr,
          btcAmount: sim.outputAmount,
          tokenAmount: tokenUnits,
          pricePerToken: String(sim.newPriceSats),
        });

        saveKnownAddress(tokenAddress);
        bumpTradeVersion();

        // Nudge the indexer — fire-and-forget
        triggerIndexer();

        toast.success(`Sell submitted! TX: ${result.txHash.slice(0, 12)}...`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Sell failed');
      } finally {
        executingRef.current = false;
        setExecuting(false);
      }
    },
    [tokenAddress, connected, walletAddress, hashedMLDSAKey, publicKey, simulateSell, bumpTradeVersion],
  );

  return { simulateBuy, simulateSell, executeBuy, executeSell, executing };
}

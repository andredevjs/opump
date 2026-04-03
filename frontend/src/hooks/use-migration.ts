import { useState, useCallback, useRef } from 'react';
import type { Token } from '@/types/token';
import { useWalletStore } from '@/stores/wallet-store';
import { useUIStore } from '@/stores/ui-store';
import { submitMigration, triggerIndexer } from '@/services/api';
import toast from 'react-hot-toast';

export function useMigration(token: Token | null) {
  const { connected, address: walletAddress, opAddress, hashedMLDSAKey, publicKey } = useWalletStore();
  const bumpTradeVersion = useUIStore((s) => s.bumpTradeVersion);
  const [migrating, setMigrating] = useState(false);
  const migratingRef = useRef(false);

  const isCreator = !!(
    token &&
    opAddress &&
    token.creatorAddress.toLowerCase() === opAddress.toLowerCase()
  );

  const executeMigrate = useCallback(async () => {
    if (migratingRef.current) return;
    if (!token || !connected || !walletAddress) {
      toast.error('Wallet not connected');
      return;
    }
    if (token.status !== 'graduated') {
      toast.error('Token must be graduated to migrate');
      return;
    }
    if (!isCreator) {
      toast.error('Only the token creator can initiate migration');
      return;
    }

    migratingRef.current = true;
    setMigrating(true);

    try {
      const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
      const { Address } = await import('@btc-vision/transaction');
      const contract = getLaunchTokenContract(token.address);

      // Set sender so the contract simulation knows who the caller is
      if (hashedMLDSAKey) {
        contract.setSender(Address.fromString(hashedMLDSAKey, publicKey ?? undefined));
      }

      // Build recipient — for now, creator receives liquidity tokens
      const recipientAddress = Address.fromString(hashedMLDSAKey!, publicKey ?? undefined);

      const simResult = await contract.migrate(recipientAddress);
      const result = await sendContractCall(simResult, {
        refundTo: walletAddress,
      });

      // Optimistically update Redis (mempool-first)
      await submitMigration({
        tokenAddress: token.address,
        txHash: result.txHash,
        recipientAddress: walletAddress,
      });

      bumpTradeVersion();
      triggerIndexer();

      toast.success(`Migration submitted! TX: ${result.txHash.slice(0, 12)}...`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Migration failed');
    } finally {
      migratingRef.current = false;
      setMigrating(false);
    }
  }, [token, connected, walletAddress, hashedMLDSAKey, publicKey, isCreator, bumpTradeVersion]);

  return { executeMigrate, migrating, isCreator };
}

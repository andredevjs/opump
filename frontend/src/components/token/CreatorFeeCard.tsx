import { useState, useEffect } from 'react';
import { useWalletStore } from '@/stores/wallet-store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Coins } from 'lucide-react';
import { formatUsd } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';

interface CreatorFeeCardProps {
  tokenAddress: string;
  creatorAddress: string;
}

export function CreatorFeeCard({ tokenAddress, creatorAddress }: CreatorFeeCardProps) {
  const { connected, address: walletAddress } = useWalletStore();
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<string | null>(null);
  const [claimableSats, setClaimableSats] = useState<number | null>(null);
  // W10: error state for data loading failures
  const [error, setError] = useState<string | null>(null);

  const { btcPrice } = useBtcPrice();
  const isCreator = connected && walletAddress === creatorAddress;

  // Fetch on-chain creator fee pool instead of iterating trades
  useEffect(() => {
    if (!isCreator) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const { getLaunchTokenContract } = await import('@/services/contract');
        const contract = getLaunchTokenContract(tokenAddress);
        const poolResult = await contract.getFeePools();
        if (cancelled) return;
        if (poolResult.revert) {
          setError(`Contract reverted: ${poolResult.revert}`);
          return;
        }
        setClaimableSats(Number(poolResult.properties.creatorFees));
      } catch (err) {
        console.warn('[CreatorFeeCard] getFeePools failed:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load fee data');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tokenAddress, isCreator]);

  if (!isCreator) return null;

  const handleClaim = async () => {
    if (!walletAddress) return;
    setClaiming(true);
    setClaimResult(null);
    try {
      const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
      const contract = getLaunchTokenContract(tokenAddress);
      const sim = await contract.claimCreatorFees();
      const receipt = await sendContractCall(sim, {
        refundTo: walletAddress,
      });
      setClaimResult(`Claimed! Tx: ${receipt.txHash.slice(0, 12)}...`);
      setClaimableSats(0);
    } catch (err) {
      setClaimResult(err instanceof Error ? err.message : 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  const loaded = claimableSats !== null && !error;
  const nothingToClaim = loaded && claimableSats === 0;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Coins size={16} className="text-accent" />
        <h3 className="text-sm font-medium text-text-secondary">Creator Fees</h3>
      </div>
      <p className="text-xs text-text-muted mb-2">
        As the token creator, you earn 0.25% of every trade.
      </p>
      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
      {!error && (
        <p className="text-sm font-mono text-text-primary mb-3">
          {claimableSats === null
            ? 'Loading...'
            : `${formatUsd(claimableSats, btcPrice)} available`}
        </p>
      )}
      {nothingToClaim && (
        <p className="text-xs text-text-muted mb-2">No fees to claim yet.</p>
      )}
      {claimResult && (
        <p className="text-xs text-text-secondary mb-2">{claimResult}</p>
      )}
      <Button
        size="sm"
        variant="secondary"
        onClick={handleClaim}
        disabled={claiming || nothingToClaim || !!error}
        className="w-full"
      >
        {claiming ? 'Claiming...' : 'Claim Creator Fees'}
      </Button>
    </Card>
  );
}

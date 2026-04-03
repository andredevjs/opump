import { useWalletStore } from '@/stores/wallet-store';
import { useCreatorFees } from '@/hooks/useCreatorFees';
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
  const { connected, opAddress } = useWalletStore();
  const { btcPrice } = useBtcPrice();
  const isCreator = connected && opAddress === creatorAddress;

  const { fees, claim } = useCreatorFees([tokenAddress], isCreator);
  const feeState = fees.get(tokenAddress);

  if (!isCreator) return null;

  const claimableSats = feeState?.claimableSats ?? null;
  const error = feeState?.error ?? null;
  const claiming = feeState?.claiming ?? false;
  const claimResult = feeState?.claimResult ?? null;

  const loaded = claimableSats !== null && !error;
  const nothingToClaim = loaded && claimableSats === 0;

  const handleClaim = () => {
    if (!walletAddress) return;
    claim(tokenAddress, walletAddress);
  };

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

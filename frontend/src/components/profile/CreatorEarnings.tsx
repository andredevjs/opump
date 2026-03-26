import { useNavigate } from 'react-router-dom';
import { useCreatorFees } from '@/hooks/useCreatorFees';
import { useWalletStore } from '@/stores/wallet-store';
import { useBtcPrice } from '@/stores/btc-price-store';
import { formatUsd } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Coins, ArrowRight } from 'lucide-react';
import type { Token } from '@/types/token';

interface CreatorEarningsProps {
  tokens: Token[];
}

export function CreatorEarnings({ tokens }: CreatorEarningsProps) {
  const navigate = useNavigate();
  const { address: walletAddress } = useWalletStore();
  const { btcPrice } = useBtcPrice();

  // Only show confirmed tokens — unconfirmed ones have no on-chain fee pools yet
  const confirmedTokens = tokens.filter((t) => t.deployBlock > 0);

  const { fees, totalClaimableSats, loading, claim } = useCreatorFees(
    confirmedTokens.map((t) => t.address),
    true,
  );

  if (loading && fees.size === 0) {
    return (
      <div className="space-y-3 py-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  // Sort tokens: claimable fees descending, then by name
  const sorted = [...confirmedTokens].sort((a, b) => {
    const aFee = fees.get(a.address)?.claimableSats ?? 0;
    const bFee = fees.get(b.address)?.claimableSats ?? 0;
    if (bFee !== aFee) return bFee - aFee;
    return a.name.localeCompare(b.name);
  });

  const tokensWithFees = sorted.filter((t) => {
    const f = fees.get(t.address);
    return f && f.claimableSats != null && f.claimableSats > 0;
  });

  return (
    <div className="space-y-4 py-2">
      {/* Summary */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-elevated">
        <div className="flex items-center gap-2">
          <Coins size={18} className="text-accent" />
          <div>
            <p className="text-xs text-text-muted">Total Claimable</p>
            <p className="font-mono font-semibold text-text-primary">
              {formatUsd(totalClaimableSats, btcPrice)}
            </p>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          {tokensWithFees.length} of {confirmedTokens.length} token{confirmedTokens.length !== 1 ? 's' : ''} with fees
        </p>
      </div>

      <p className="text-xs text-text-muted px-1">
        Includes base creator fees (0.25%) plus any flywheel earnings routed to your wallet.
      </p>

      {/* Per-token rows */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          <p>No claimable fees yet. Fees accumulate as your tokens are traded.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((token) => {
            const feeState = fees.get(token.address);
            const claimable = feeState?.claimableSats ?? null;
            const hasFees = claimable != null && claimable > 0;
            const isError = !!feeState?.error;
            const isClaiming = !!feeState?.claiming;
            const hasFlywheel =
              token.flywheelDestination === 'creator' &&
              (token.buyTaxPercent > 0 || token.sellTaxPercent > 0);

            return (
              <Card key={token.address} className="flex items-center justify-between gap-3">
                {/* Token info (clickable) */}
                <button
                  type="button"
                  onClick={() => navigate(`/token/${token.address}`)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                >
                  <span className="text-2xl flex-shrink-0">{token.image}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary truncate">{token.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-text-muted">${token.symbol}</span>
                      {hasFlywheel && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                          <ArrowRight size={10} />
                          Flywheel
                        </span>
                      )}
                      {token.flywheelDestination === 'burn' &&
                        (token.buyTaxPercent > 0 || token.sellTaxPercent > 0) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                            Burn
                          </span>
                        )}
                    </div>
                  </div>
                </button>

                {/* Fee amount + claim */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    {isError && (
                      <p className="text-xs text-red-400">{feeState.error}</p>
                    )}
                    {!isError && claimable === null && (
                      <p className="text-xs text-text-muted">Loading...</p>
                    )}
                    {!isError && claimable !== null && (
                      <p className="font-mono text-sm text-text-primary">
                        {formatUsd(claimable, btcPrice)}
                      </p>
                    )}
                    {feeState?.claimResult && (
                      <p className="text-[10px] text-text-secondary max-w-[140px] truncate">
                        {feeState.claimResult}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => walletAddress && claim(token.address, walletAddress)}
                    disabled={!hasFees || isClaiming || isError}
                  >
                    {isClaiming ? 'Claiming...' : 'Claim'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

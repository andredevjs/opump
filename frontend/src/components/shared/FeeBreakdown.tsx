import { cn } from '@/lib/cn';
import { formatBtc } from '@/lib/format';
import { PLATFORM_FEE_PERCENT, CREATOR_FEE_PERCENT, MINTER_FEE_PERCENT } from '@/config/constants';

interface FeeBreakdownProps {
  totalFeeSats: number;
  className?: string;
}

export function FeeBreakdown({ totalFeeSats, className }: FeeBreakdownProps) {
  const platformFee = Math.floor(totalFeeSats * (PLATFORM_FEE_PERCENT / 1.5));
  const creatorFee = Math.floor(totalFeeSats * (CREATOR_FEE_PERCENT / 1.5));
  const minterFee = Math.floor(totalFeeSats * (MINTER_FEE_PERCENT / 1.5));

  return (
    <div className={cn('space-y-1 text-xs', className)}>
      <div className="flex justify-between text-text-secondary">
        <span>Platform ({PLATFORM_FEE_PERCENT}%)</span>
        <span className="font-mono">{formatBtc(platformFee)}</span>
      </div>
      <div className="flex justify-between text-text-secondary">
        <span>Creator ({CREATOR_FEE_PERCENT}%)</span>
        <span className="font-mono">{formatBtc(creatorFee)}</span>
      </div>
      <div className="flex justify-between text-text-secondary">
        <span>Minter Pool ({MINTER_FEE_PERCENT}%)</span>
        <span className="font-mono">{formatBtc(minterFee)}</span>
      </div>
      <div className="flex justify-between text-text-primary font-medium border-t border-border pt-1">
        <span>Total Fee</span>
        <span className="font-mono">{formatBtc(totalFeeSats)}</span>
      </div>
    </div>
  );
}

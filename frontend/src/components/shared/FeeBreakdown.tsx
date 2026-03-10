import { cn } from '@/lib/cn';
import { formatBtc } from '@/lib/format';
import { PLATFORM_FEE_PERCENT, CREATOR_FEE_PERCENT, MINTER_FEE_PERCENT, TOTAL_FEE_PERCENT } from '@/config/constants';

interface FeeBreakdownProps {
  totalFeeSats: number;
  flywheelTaxSats?: number;
  flywheelDestination?: string;
  className?: string;
}

export function FeeBreakdown({ totalFeeSats, flywheelTaxSats, flywheelDestination, className }: FeeBreakdownProps) {
  const platformFee = Math.floor(totalFeeSats * (PLATFORM_FEE_PERCENT / TOTAL_FEE_PERCENT));
  const creatorFee = Math.floor(totalFeeSats * (CREATOR_FEE_PERCENT / TOTAL_FEE_PERCENT));
  // Derive minter fee as remainder to ensure sub-fees sum to total
  const minterFee = totalFeeSats - platformFee - creatorFee;

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
      {flywheelTaxSats != null && flywheelTaxSats > 0 && (
        <div className="flex justify-between text-text-secondary">
          <span>Flywheel ({flywheelDestination || 'burn'})</span>
          <span className="font-mono">{formatBtc(flywheelTaxSats)}</span>
        </div>
      )}
      <div className="flex justify-between text-text-primary font-medium border-t border-border pt-1">
        <span>Total Fee</span>
        <span className="font-mono">{formatBtc(totalFeeSats + (flywheelTaxSats ?? 0))}</span>
      </div>
    </div>
  );
}

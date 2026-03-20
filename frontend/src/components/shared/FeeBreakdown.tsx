import { cn } from '@/lib/cn';
import { formatUsd } from '@/lib/format';
import { PLATFORM_FEE_PERCENT, CREATOR_FEE_PERCENT, TOTAL_FEE_PERCENT } from '@/config/constants';

interface FeeBreakdownProps {
  totalFeeSats: number;
  btcPrice: number;
  flywheelTaxSats?: number;
  flywheelDestination?: string;
  className?: string;
}

export function FeeBreakdown({ totalFeeSats, btcPrice, flywheelTaxSats, flywheelDestination, className }: FeeBreakdownProps) {
  const platformFee = Math.floor(totalFeeSats * (PLATFORM_FEE_PERCENT / TOTAL_FEE_PERCENT));
  const creatorFee = totalFeeSats - platformFee;

  return (
    <div className={cn('space-y-1 text-xs', className)}>
      <div className="flex justify-between text-text-secondary">
        <span>Platform ({PLATFORM_FEE_PERCENT}%)</span>
        <span className="font-mono">{formatUsd(platformFee, btcPrice)}</span>
      </div>
      <div className="flex justify-between text-text-secondary">
        <span>Creator ({CREATOR_FEE_PERCENT}%)</span>
        <span className="font-mono">{formatUsd(creatorFee, btcPrice)}</span>
      </div>
      {flywheelTaxSats != null && flywheelTaxSats > 0 && (
        <div className="flex justify-between text-text-secondary">
          <span>Flywheel ({flywheelDestination || 'burn'})</span>
          <span className="font-mono">{formatUsd(flywheelTaxSats, btcPrice)}</span>
        </div>
      )}
      <div className="flex justify-between text-text-primary font-medium border-t border-border pt-1">
        <span>Total Fee</span>
        <span className="font-mono">{formatUsd(totalFeeSats + (flywheelTaxSats ?? 0), btcPrice)}</span>
      </div>
    </div>
  );
}

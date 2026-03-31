import * as Progress from '@radix-ui/react-progress';
import { cn } from '@/lib/cn';
import { formatBtc, formatMcapUsd, priceSatsToMcapUsd } from '@/lib/format';
import { GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import type { TokenStatus } from '@/types/token';

interface GraduationProgressProps {
  progress: number;
  realBtcSats: number;
  className?: string;
  compact?: boolean;
  status?: TokenStatus;
  btcPrice?: number;
  currentPriceSats?: number;
}

function getStatusLabel(status: TokenStatus | undefined, isGraduated: boolean): string {
  if (status === 'migrated') return 'Trading on MotoSwap';
  if (status === 'migrating') return 'Migrating to MotoSwap...';
  if (isGraduated || status === 'graduated') return 'Graduated to DEX';
  return 'Graduation Progress';
}

export function GraduationProgress({ progress, realBtcSats, className, compact, status, btcPrice, currentPriceSats }: GraduationProgressProps) {
  const isGraduated = progress >= 100;
  const isMigrating = status === 'migrating';
  const isMigrated = status === 'migrated';

  const showUsd = btcPrice != null && btcPrice > 0;
  const currentMcapUsd = showUsd ? priceSatsToMcapUsd(currentPriceSats ?? 0, btcPrice!) : 0;

  return (
    <div className={cn('space-y-1.5', className)}>
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <span className={cn('text-text-secondary', isMigrating && 'animate-pulse')}>
            {getStatusLabel(status, isGraduated)}
          </span>
          <span className={cn('font-mono', (isGraduated || isMigrated) ? 'text-bull' : 'text-accent')}>
            {progress.toFixed(1)}%
          </span>
        </div>
      )}
      <Progress.Root
        value={progress}
        className="h-2 w-full rounded-full bg-input overflow-hidden"
      >
        <Progress.Indicator
          className={cn(
            'h-full rounded-full transition-all duration-500',
            isMigrated ? 'bg-bull' : isMigrating ? 'bg-accent animate-pulse' : isGraduated ? 'bg-bull' : 'bg-accent',
          )}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </Progress.Root>
      {!compact && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{showUsd ? formatMcapUsd(currentMcapUsd) : formatBtc(realBtcSats)}</span>
          <span>{formatBtc(GRADUATION_THRESHOLD_SATS)}</span>
        </div>
      )}
    </div>
  );
}

import * as Progress from '@radix-ui/react-progress';
import { cn } from '@/lib/cn';
import { formatBtc } from '@/lib/format';
import { GRADUATION_THRESHOLD_SATS } from '@/config/constants';

interface GraduationProgressProps {
  progress: number;
  realBtcSats: number;
  className?: string;
  compact?: boolean;
}

export function GraduationProgress({ progress, realBtcSats, className, compact }: GraduationProgressProps) {
  const isGraduated = progress >= 100;

  return (
    <div className={cn('space-y-1.5', className)}>
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">
            {isGraduated ? 'Graduated to DEX' : 'Graduation Progress'}
          </span>
          <span className={cn('font-mono', isGraduated ? 'text-bull' : 'text-accent')}>
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
            isGraduated ? 'bg-bull' : 'bg-accent',
          )}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </Progress.Root>
      {!compact && (
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{formatBtc(realBtcSats)}</span>
          <span>{formatBtc(GRADUATION_THRESHOLD_SATS)}</span>
        </div>
      )}
    </div>
  );
}

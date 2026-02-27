import { cn } from '@/lib/cn';
import type { TimeframeKey } from '@/mock/ohlcv';

interface ChartControlsProps {
  timeframe: TimeframeKey;
  onTimeframeChange: (tf: TimeframeKey) => void;
}

const TIMEFRAMES: { label: string; value: TimeframeKey }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

export function ChartControls({ timeframe, onTimeframeChange }: ChartControlsProps) {
  return (
    <div className="flex items-center gap-1">
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf.value}
          onClick={() => onTimeframeChange(tf.value)}
          className={cn(
            'px-2.5 py-1 rounded text-xs font-medium transition-colors',
            timeframe === tf.value
              ? 'bg-accent/10 text-accent'
              : 'text-text-muted hover:text-text-secondary hover:bg-elevated',
          )}
        >
          {tf.label}
        </button>
      ))}
    </div>
  );
}

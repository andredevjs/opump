import { cn } from '@/lib/cn';
import type { TimeframeKey } from '@/types/api';
import type { ChartType } from '@/stores/price-store';
import { LineChart, CandlestickChart } from 'lucide-react';

interface ChartControlsProps {
  timeframe: TimeframeKey;
  onTimeframeChange: (tf: TimeframeKey) => void;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
}

const TIMEFRAMES: { label: string; value: TimeframeKey }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

const CHART_TYPES: { icon: typeof LineChart; value: ChartType; label: string }[] = [
  { icon: LineChart, value: 'line', label: 'Line chart' },
  { icon: CandlestickChart, value: 'candlestick', label: 'Candlestick chart' },
];

export function ChartControls({ timeframe, onTimeframeChange, chartType, onChartTypeChange }: ChartControlsProps) {
  return (
    <div className="flex items-center gap-1">
      {CHART_TYPES.map(({ icon: Icon, value, label }) => (
        <button
          type="button"
          key={value}
          onClick={() => onChartTypeChange(value)}
          aria-pressed={chartType === value}
          aria-label={label}
          className={cn(
            'p-1.5 rounded transition-colors',
            chartType === value
              ? 'bg-accent/10 text-accent'
              : 'text-text-muted hover:text-text-secondary hover:bg-elevated',
          )}
        >
          <Icon size={14} />
        </button>
      ))}
      <div className="w-px h-4 bg-border mx-1" />
      {TIMEFRAMES.map((tf) => (
        <button
          type="button"
          key={tf.value}
          onClick={() => onTimeframeChange(tf.value)}
          aria-pressed={timeframe === tf.value}
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

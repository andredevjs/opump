import { cn } from '@/lib/cn';
import { formatUsdPrice, formatPercent } from '@/lib/format';

interface TokenPriceProps {
  priceSats: number;
  change24h: number;
  btcPrice: number;
  size?: 'sm' | 'md' | 'lg';
  showChange?: boolean;
  isOptimistic?: boolean;
}

export function TokenPrice({ priceSats, change24h, btcPrice, size = 'md', showChange = true, isOptimistic = false }: TokenPriceProps) {
  const isPositive = change24h >= 0;

  return (
    <div className="flex items-baseline gap-2">
      <span
        className={cn('font-mono font-semibold text-text-primary', {
          'text-sm': size === 'sm',
          'text-base': size === 'md',
          'text-xl': size === 'lg',
        })}
      >
        {isOptimistic ? '~' : ''}{formatUsdPrice(priceSats, btcPrice)}
      </span>
      {showChange && (
        <span
          className={cn('font-mono font-medium', {
            'text-xs': size === 'sm',
            'text-sm': size === 'md',
            'text-base': size === 'lg',
          }, isPositive ? 'text-bull' : 'text-bear')}
        >
          {formatPercent(change24h)}
        </span>
      )}
      {isOptimistic && (
        <span className={cn('text-accent/60 italic', {
          'text-[10px]': size === 'sm',
          'text-xs': size === 'md',
          'text-sm': size === 'lg',
        })}>
          pending
        </span>
      )}
    </div>
  );
}

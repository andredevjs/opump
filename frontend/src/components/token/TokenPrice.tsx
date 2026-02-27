import { cn } from '@/lib/cn';
import { formatPrice, formatPercent } from '@/lib/format';

interface TokenPriceProps {
  priceSats: number;
  change24h: number;
  size?: 'sm' | 'md' | 'lg';
  showChange?: boolean;
}

export function TokenPrice({ priceSats, change24h, size = 'md', showChange = true }: TokenPriceProps) {
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
        {formatPrice(priceSats)}
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
    </div>
  );
}

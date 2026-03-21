import { useNavigate } from 'react-router-dom';
import type { Token } from '@/types/token';
import { TokenBadge } from './TokenBadge';
import { priceSatsToMcapUsd, formatMcapUsd, formatPercent, formatUsd } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import { cn } from '@/lib/cn';

interface TokenListProps {
  tokens: Token[];
}

export function TokenList({ tokens }: TokenListProps) {
  const navigate = useNavigate();
  const { btcPrice } = useBtcPrice();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs border-b border-border">
            <th scope="col" className="text-left py-3 px-2">Token</th>
            <th scope="col" className="text-right py-3 px-2">MCAP</th>
            <th scope="col" className="text-right py-3 px-2">24h</th>
            <th scope="col" className="text-right py-3 px-2 hidden sm:table-cell">Volume</th>
            <th scope="col" className="text-right py-3 px-2 hidden md:table-cell">Holders</th>
            <th scope="col" className="text-right py-3 px-2 hidden md:table-cell">Status</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr
              key={token.address}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/token/${token.address}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/token/${token.address}`);
                }
              }}
              className="border-b border-border/50 hover:bg-elevated cursor-pointer transition-colors"
            >
              <td className="py-3 px-2">
                <div className="flex items-center gap-2">
                  {token.imageUrl ? (
                    <img src={token.imageUrl} alt={token.name} className="w-7 h-7 rounded-md object-cover" />
                  ) : (
                    <span className="text-xl">{token.image}</span>
                  )}
                  <div>
                    <span className="font-medium text-text-primary">{token.name}</span>
                    <span className="ml-1.5 text-xs text-text-muted">${token.symbol}</span>
                  </div>
                </div>
              </td>
              <td className="text-right py-3 px-2 font-mono text-text-primary">
                {formatMcapUsd(priceSatsToMcapUsd(token.currentPriceSats, btcPrice))}
              </td>
              <td className={cn('text-right py-3 px-2 font-mono', token.priceChange24h >= 0 ? 'text-bull' : 'text-bear')}>
                {formatPercent(token.priceChange24h)}
              </td>
              <td className="text-right py-3 px-2 font-mono text-text-secondary hidden sm:table-cell">
                {formatUsd(token.volume24hSats, btcPrice)}
              </td>
              <td className="text-right py-3 px-2 font-mono text-text-secondary hidden md:table-cell">
                {token.holderCount.toLocaleString()}
              </td>
              <td className="text-right py-3 px-2 hidden md:table-cell">
                <TokenBadge status={token.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

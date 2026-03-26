import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { TokenPrice } from './TokenPrice';
import { TokenBadge } from './TokenBadge';
import { GraduationProgress } from '@/components/shared/GraduationProgress';
import type { Token } from '@/types/token';
import { formatUsd, formatNumber, priceSatsToMcapUsd, formatMcapUsd } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import { cn } from '@/lib/cn';

interface TokenCardProps {
  token: Token;
  compact?: boolean;
}

export function TokenCard({ token, compact }: TokenCardProps) {
  const navigate = useNavigate();
  const { btcPrice } = useBtcPrice();

  return (
    <Card
      hover
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/token/${token.address}`)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/token/${token.address}`);
        }
      }}
      className={cn(compact && 'p-3')}
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-lg bg-elevated flex items-center justify-center text-2xl shrink-0 overflow-hidden">
          {token.imageUrl ? (
            <img src={token.imageUrl} alt={token.name} className="w-full h-full object-cover" />
          ) : (
            token.image
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-text-primary truncate">{token.name}</h3>
            <span className="text-xs text-text-muted font-mono">${token.symbol}</span>
            <TokenBadge status={token.status} deployBlock={token.deployBlock} />
          </div>
          <TokenPrice priceSats={token.currentPriceSats} change24h={token.priceChange24h} btcPrice={btcPrice} size="sm" />
        </div>
      </div>

      {!compact && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-text-muted">Vol 24h</span>
              <p className="font-mono text-text-secondary">{formatUsd(token.volume24hSats, btcPrice)}</p>
            </div>
            <div>
              <span className="text-text-muted">MCap</span>
              <p className="font-mono text-text-secondary">{formatMcapUsd(priceSatsToMcapUsd(token.currentPriceSats, btcPrice))}</p>
            </div>
            <div>
              <span className="text-text-muted">Holders</span>
              <p className="font-mono text-text-secondary">{formatNumber(token.holderCount)}</p>
            </div>
          </div>

          <GraduationProgress
            progress={token.graduationProgress}
            realBtcSats={Number(token.realBtcReserve)}
            compact
            className="mt-3"
          />
        </>
      )}
    </Card>
  );
}

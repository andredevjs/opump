import { useNavigate } from 'react-router-dom';
import { Globe, Twitter, Send, MessageCircle, Github } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { GraduationProgress } from '@/components/shared/GraduationProgress';
import { useBtcPrice } from '@/stores/btc-price-store';
import { formatUsd, formatNumber, timeAgo, shortenAddress, formatPercent, priceSatsToMcapUsd, formatMcapUsd } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Token } from '@/types/token';

interface TrenchTokenRowProps {
  token: Token;
}

export function TrenchTokenRow({ token }: TrenchTokenRowProps) {
  const navigate = useNavigate();
  const { btcPrice } = useBtcPrice();

  return (
    <div
      onClick={() => navigate(`/token/${token.address}`)}
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-elevated transition-colors cursor-pointer border border-transparent hover:border-border"
    >
      {/* Token image */}
      <div className="w-12 h-12 rounded-lg bg-elevated border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
        {token.imageUrl ? (
          <img
            src={token.imageUrl}
            alt={token.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-text-muted">{token.image}</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: name, symbol, address */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-text-primary truncate text-sm">
            {token.name}
          </span>
          <span className="text-text-muted text-xs">${token.symbol}</span>
          <span className="text-text-muted text-xs hidden sm:inline">
            {shortenAddress(token.address, 4)}
          </span>
        </div>

        {/* Row 2: age + socials */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-text-muted text-xs">{timeAgo(token.createdAt)}</span>
          {token.website && <Globe size={12} className="text-text-muted" />}
          {token.twitter && <Twitter size={12} className="text-text-muted" />}
          {token.telegram && <Send size={12} className="text-text-muted" />}
          {token.discord && <MessageCircle size={12} className="text-text-muted" />}
          {token.github && <Github size={12} className="text-text-muted" />}
        </div>

        {/* Row 3: stats */}
        <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
          <span className="text-sm font-semibold text-accent">MC {formatMcapUsd(priceSatsToMcapUsd(token.currentPriceSats, btcPrice))}</span>
          <span className="text-text-muted">·</span>
          <span>TX {formatNumber(token.tradeCount24h)}</span>
          <span className="text-text-muted">·</span>
          <span>V {formatUsd(token.volume24hSats, btcPrice)}</span>
        </div>

        {/* Row 4: pills */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <Badge variant="accent" className="text-[10px] px-1.5 py-0">
            {formatNumber(token.holderCount)} holders
          </Badge>
          <Badge
            variant={token.priceChange24h >= 0 ? 'bull' : 'bear'}
            className={cn('text-[10px] px-1.5 py-0')}
          >
            {formatPercent(token.priceChange24h)}
          </Badge>
        </div>

        {/* Graduation progress bar */}
        <GraduationProgress
          progress={token.graduationProgress}
          realBtcSats={Number(token.realBtcReserve)}
          status={token.status}
          compact
          className="mt-1.5"
        />
      </div>
    </div>
  );
}

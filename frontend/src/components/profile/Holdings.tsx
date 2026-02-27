import { useNavigate } from 'react-router-dom';
import { useTradeStore } from '@/stores/trade-store';
import { useTokenStore } from '@/stores/token-store';
import { formatTokenAmount, formatBtc } from '@/lib/format';
import { Card } from '@/components/ui/Card';

export function Holdings() {
  const navigate = useNavigate();
  const holdings = useTradeStore((s) => s.holdings);
  const getToken = useTokenStore((s) => s.getToken);

  const entries = Object.entries(holdings).filter(([, v]) => v > 0);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p>No holdings yet. Buy some tokens to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([address, units]) => {
        const token = getToken(address);
        if (!token) return null;
        const valueSats = units * token.currentPriceSats;

        return (
          <Card
            key={address}
            hover
            onClick={() => navigate(`/token/${address}`)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{token.image}</span>
              <div>
                <p className="font-medium text-text-primary">{token.name}</p>
                <p className="text-xs text-text-muted">${token.symbol}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-text-primary">{formatTokenAmount(units)}</p>
              <p className="text-xs font-mono text-text-secondary">{formatBtc(valueSats)}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

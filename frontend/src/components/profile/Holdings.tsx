import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BigNumber from 'bignumber.js';
import { getKnownTokenAddresses } from '@/lib/known-tokens';
import { useTokenStore } from '@/stores/token-store';
import { useWalletStore } from '@/stores/wallet-store';
import { useUIStore } from '@/stores/ui-store';
import { TOKEN_UNITS_PER_TOKEN } from '@/config/constants';
import { formatTokenAmount, formatUsd } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import { Card } from '@/components/ui/Card';

export function Holdings() {
  const navigate = useNavigate();
  const [holdings, setHoldings] = useState<Record<string, string>>({});
  const getToken = useTokenStore((s) => s.getToken);
  const { connected, hashedMLDSAKey, publicKey } = useWalletStore();
  const { btcPrice } = useBtcPrice();
  const tradeVersion = useUIStore((s) => s.tradeVersion);

  // Refresh all known holdings from on-chain
  useEffect(() => {
    if (!connected || !hashedMLDSAKey || !publicKey) return;
    let cancelled = false;
    const addresses = getKnownTokenAddresses();
    if (addresses.length === 0) return;

    import('@/services/contract').then(({ fetchBalanceOf }) => {
      for (const addr of addresses) {
        fetchBalanceOf(addr, hashedMLDSAKey, publicKey)
          .then((balance) => {
            if (!cancelled) {
              setHoldings((prev) => ({ ...prev, [addr]: balance }));
            }
          })
          .catch(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [connected, hashedMLDSAKey, publicKey, tradeVersion]);

  const entries = Object.entries(holdings).filter(([, v]) => v !== '0' && v !== undefined);

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
        if (!token?.currentPriceSats) return null;
        const valueSats = new BigNumber(units).times(token.currentPriceSats).div(TOKEN_UNITS_PER_TOKEN).toNumber();

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
              <p className="text-xs font-mono text-text-secondary">{formatUsd(valueSats, btcPrice)}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

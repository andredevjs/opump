import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BigNumber from 'bignumber.js';
import { useTradeStore, getKnownTokenAddresses } from '@/stores/trade-store';
import { useTokenStore } from '@/stores/token-store';
import { useWalletStore } from '@/stores/wallet-store';
import { formatTokenAmount, formatBtc } from '@/lib/format';
import { Card } from '@/components/ui/Card';

export function Holdings() {
  const navigate = useNavigate();
  const holdings = useTradeStore((s) => s.holdings);
  const setHolding = useTradeStore((s) => s.setHolding);
  const getToken = useTokenStore((s) => s.getToken);
  const { connected, hashedMLDSAKey, publicKey } = useWalletStore();

  // Refresh all known holdings from on-chain in real mode
  useEffect(() => {
    if (!connected || !hashedMLDSAKey || !publicKey) return;
    let cancelled = false;
    const addresses = getKnownTokenAddresses();
    if (addresses.length === 0) return;

    import('@/services/contract').then(({ fetchBalanceOf }) => {
      for (const addr of addresses) {
        fetchBalanceOf(addr, hashedMLDSAKey, publicKey)
          .then((balance) => { if (!cancelled) setHolding(addr, balance); })
          .catch(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [connected, hashedMLDSAKey, publicKey, setHolding]);

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
        if (!token) return null;
        const valueSats = new BigNumber(units).times(token.currentPriceSats).toNumber();

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

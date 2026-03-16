import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FeeBreakdown } from '@/components/shared/FeeBreakdown';
import type { Token } from '@/types/token';
import { useTradeSimulation } from '@/hooks/use-trade-simulation';
import { useWalletStore } from '@/stores/wallet-store';
import { useTradeStore } from '@/stores/trade-store';
import BigNumber from 'bignumber.js';
import { formatBtc, formatTokenAmount, tokensToUnits } from '@/lib/format';
import { TOKEN_UNITS_PER_TOKEN } from '@/config/constants';

const QUICK_PERCENTS = [25, 50, 75, 100];

interface SellFormProps {
  token: Token;
}

export function SellForm({ token }: SellFormProps) {
  const [amount, setAmount] = useState('');
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const { simulateSell, executeSell, executing } = useTradeSimulation(token);
  const { connected, hashedMLDSAKey, publicKey } = useWalletStore();
  const holding = useTradeStore((s) => s.getHolding(token.address));
  const setHolding = useTradeStore((s) => s.setHolding);
  // T023: Re-fetch on-chain balance when a self-trade is detected
  const selfTradeCounter = useTradeStore((s) => s.selfTradeCounter);

  // Fetch on-chain balance in real mode
  useEffect(() => {
    if (!connected || !hashedMLDSAKey || !publicKey) return;
    let cancelled = false;
    setBalanceError(null);
    import('@/services/contract').then(({ fetchBalanceOf }) =>
      fetchBalanceOf(token.address, hashedMLDSAKey, publicKey)
        .then((balance) => { if (!cancelled) setHolding(token.address, balance); })
        .catch((err) => { if (!cancelled) setBalanceError(err instanceof Error ? err.message : 'Failed to fetch balance'); }),
    );
    return () => { cancelled = true; };
  }, [token.address, connected, hashedMLDSAKey, publicKey, setHolding, selfTradeCounter]);

  const holdingBn = new BigNumber(holding);
  const hasHolding = holdingBn.isGreaterThan(0);

  // S21: Derive simulation from amount via useMemo instead of useEffect+setState
  const simulation = useMemo(() => {
    const tokens = parseFloat(amount);
    if (isNaN(tokens) || tokens <= 0) return null;
    return simulateSell(tokensToUnits(tokens));
  }, [amount, simulateSell]);

  const handleSell = () => {
    const tokens = parseFloat(amount);
    if (!isNaN(tokens) && tokens > 0) {
      executeSell(tokensToUnits(tokens));
      setAmount('');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="sell-amount" className="text-xs text-text-muted mb-1.5 block">Amount ({token.symbol})</label>
        <Input
          id="sell-amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
        />
        {hasHolding && (
          <div className="flex gap-2 mt-2">
            {QUICK_PERCENTS.map((pct) => (
              <button
                type="button"
                key={pct}
                onClick={() => setAmount(holdingBn.div(TOKEN_UNITS_PER_TOKEN).times(pct).div(100).toFixed(8))}
                className="flex-1 py-1.5 text-xs rounded bg-elevated hover:bg-input text-text-secondary font-mono transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}
      </div>

      {simulation && (
        <div className="space-y-3 p-3 rounded-lg bg-background">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">You receive</span>
            <span className="font-mono text-accent">{formatBtc(simulation.outputAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Price impact</span>
            <span className="font-mono text-text-primary">{Math.abs(simulation.priceImpactPercent).toFixed(2)}%</span>
          </div>
          <FeeBreakdown totalFeeSats={simulation.fee} />
        </div>
      )}

      <Button
        variant="bear"
        size="lg"
        className="w-full"
        onClick={handleSell}
        disabled={!connected || !simulation || executing || !hasHolding}
      >
        {!connected
          ? 'Connect Wallet'
          : executing
          ? 'Executing...'
          : !hasHolding
          ? 'No Holdings'
          : `Sell ${token.symbol}`}
      </Button>

      {balanceError && (
        <p className="text-xs text-bear text-center">{balanceError}</p>
      )}
      {connected && hasHolding && (
        <p className="text-xs text-text-muted text-center">
          Holdings: {formatTokenAmount(holding)} {token.symbol}
        </p>
      )}
    </div>
  );
}

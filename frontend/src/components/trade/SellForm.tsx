import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FeeBreakdown } from '@/components/shared/FeeBreakdown';
import type { Token } from '@/types/token';
import type { TradeSimulation } from '@/types/trade';
import { useTradeSimulation } from '@/hooks/use-trade-simulation';
import { useWalletStore } from '@/stores/wallet-store';
import { useTradeStore } from '@/stores/trade-store';
import { formatBtc, formatTokenAmount, tokensToUnits } from '@/lib/format';

interface SellFormProps {
  token: Token;
}

export function SellForm({ token }: SellFormProps) {
  const [amount, setAmount] = useState('');
  const [simulation, setSimulation] = useState<TradeSimulation | null>(null);
  const { simulateSell, executeSell, executing } = useTradeSimulation(token);
  const { connected } = useWalletStore();
  const holding = useTradeStore((s) => s.getHolding(token.address));

  useEffect(() => {
    const tokens = parseFloat(amount);
    if (!isNaN(tokens) && tokens > 0) {
      const units = tokensToUnits(tokens);
      setSimulation(simulateSell(units));
    } else {
      setSimulation(null);
    }
  }, [amount, simulateSell]);

  const handleSell = () => {
    const tokens = parseFloat(amount);
    if (!isNaN(tokens) && tokens > 0) {
      executeSell(tokensToUnits(tokens));
      setAmount('');
    }
  };

  const QUICK_PERCENTS = [25, 50, 75, 100];

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">Amount ({token.symbol})</label>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0"
        />
        {holding > 0 && (
          <div className="flex gap-2 mt-2">
            {QUICK_PERCENTS.map((pct) => (
              <button
                key={pct}
                onClick={() => setAmount(((holding / 100_000_000) * pct / 100).toString())}
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
        disabled={!connected || !simulation || executing || holding <= 0}
      >
        {!connected
          ? 'Connect Wallet'
          : executing
          ? 'Executing...'
          : holding <= 0
          ? 'No Holdings'
          : `Sell ${token.symbol}`}
      </Button>

      {connected && holding > 0 && (
        <p className="text-xs text-text-muted text-center">
          Holdings: {formatTokenAmount(holding)} {token.symbol}
        </p>
      )}
    </div>
  );
}

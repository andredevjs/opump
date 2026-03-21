import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FeeBreakdown } from '@/components/shared/FeeBreakdown';
import type { Token } from '@/types/token';
import { useTradeSimulation } from '@/hooks/use-trade-simulation';
import { useWalletStore } from '@/stores/wallet-store';
import { formatUsd, formatTokenAmount, usdToSats } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import BigNumber from 'bignumber.js';

const QUICK_AMOUNTS = [25, 50, 100, 250]; // USD

interface BuyFormProps {
  token: Token;
}

export function BuyForm({ token }: BuyFormProps) {
  const [amount, setAmount] = useState('');
  const { simulateBuy, executeBuy, executing } = useTradeSimulation(token);
  const { connected, balanceSats } = useWalletStore();
  const { btcPrice } = useBtcPrice();

  // S21: Derive simulation from amount via useMemo instead of useEffect+setState
  const simulation = useMemo(() => {
    const usd = parseFloat(amount);
    if (isNaN(usd) || usd <= 0 || btcPrice <= 0) return null;
    return simulateBuy(String(usdToSats(usd, btcPrice)));
  }, [amount, simulateBuy, btcPrice]);

  const handleBuy = () => {
    const usd = parseFloat(amount);
    if (!isNaN(usd) && usd > 0 && btcPrice > 0) {
      executeBuy(String(usdToSats(usd, btcPrice)));
      setAmount('');
    }
  };

  const insufficientBalance = simulation && new BigNumber(simulation.inputAmount).isGreaterThan(balanceSats);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="buy-amount" className="text-xs text-text-muted mb-1.5 block">Amount (USD)</label>
        <Input
          id="buy-amount"
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="1"
          min="0"
        />
        <div className="flex gap-2 mt-2">
          {QUICK_AMOUNTS.map((qa) => (
            <button
              type="button"
              key={qa}
              onClick={() => setAmount(qa.toString())}
              className="flex-1 py-1.5 text-xs rounded bg-elevated hover:bg-input text-text-secondary font-mono transition-colors"
            >
              ${qa}
            </button>
          ))}
        </div>
      </div>

      {simulation && (
        <div className="space-y-3 p-3 rounded-lg bg-background">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">You receive</span>
            <span className="font-mono text-bull">{formatTokenAmount(simulation.outputAmount)} {token.symbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Price impact</span>
            <span className="font-mono text-text-primary">{simulation.priceImpactPercent.toFixed(2)}%</span>
          </div>
          <FeeBreakdown totalFeeSats={simulation.fee} btcPrice={btcPrice} />
        </div>
      )}

      <Button
        variant="bull"
        size="lg"
        className="w-full"
        onClick={handleBuy}
        disabled={!connected || !simulation || executing || !!insufficientBalance}
      >
        {!connected
          ? 'Connect Wallet'
          : executing
          ? 'Executing...'
          : insufficientBalance
          ? 'Insufficient Balance'
          : `Buy ${token.symbol}`}
      </Button>

      {connected && (
        <p className="text-xs text-text-muted text-center">
          Balance: {formatUsd(balanceSats, btcPrice)}
        </p>
      )}
    </div>
  );
}

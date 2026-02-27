import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { FeeBreakdown } from '@/components/shared/FeeBreakdown';
import type { Token } from '@/types/token';
import type { TradeSimulation } from '@/types/trade';
import { useTradeSimulation } from '@/hooks/use-trade-simulation';
import { useWalletStore } from '@/stores/wallet-store';
import { formatBtc, formatTokenAmount } from '@/lib/format';
import { btcToSats } from '@/lib/format';

const QUICK_AMOUNTS = [0.001, 0.005, 0.01, 0.05]; // BTC

interface BuyFormProps {
  token: Token;
}

export function BuyForm({ token }: BuyFormProps) {
  const [amount, setAmount] = useState('');
  const [simulation, setSimulation] = useState<TradeSimulation | null>(null);
  const { simulateBuy, executeBuy, executing } = useTradeSimulation(token);
  const { connected, balanceSats } = useWalletStore();

  useEffect(() => {
    const btc = parseFloat(amount);
    if (!isNaN(btc) && btc > 0) {
      const sats = btcToSats(btc);
      setSimulation(simulateBuy(sats));
    } else {
      setSimulation(null);
    }
  }, [amount, simulateBuy]);

  const handleBuy = () => {
    const btc = parseFloat(amount);
    if (!isNaN(btc) && btc > 0) {
      executeBuy(btcToSats(btc));
      setAmount('');
    }
  };

  const insufficientBalance = simulation && simulation.inputAmount > balanceSats;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-text-muted mb-1.5 block">Amount (BTC)</label>
        <Input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          step="0.001"
          min="0"
        />
        <div className="flex gap-2 mt-2">
          {QUICK_AMOUNTS.map((qa) => (
            <button
              key={qa}
              onClick={() => setAmount(qa.toString())}
              className="flex-1 py-1.5 text-xs rounded bg-elevated hover:bg-input text-text-secondary font-mono transition-colors"
            >
              {qa} BTC
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
          <FeeBreakdown totalFeeSats={simulation.fee} />
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
          Balance: {formatBtc(balanceSats)}
        </p>
      )}
    </div>
  );
}

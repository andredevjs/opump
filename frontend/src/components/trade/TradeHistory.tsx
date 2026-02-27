import { useState, useEffect } from 'react';
import type { Token } from '@/types/token';
import type { Trade } from '@/types/trade';
import { generateTradesForToken } from '@/mock/trades';
import { formatBtc, formatTokenAmount, shortenAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';

interface TradeHistoryProps {
  token: Token;
}

export function TradeHistory({ token }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    setTrades(generateTradesForToken(token, 30));
  }, [token.address]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="text-left py-2 px-2">Type</th>
            <th className="text-right py-2 px-2">Amount</th>
            <th className="text-right py-2 px-2">BTC</th>
            <th className="text-right py-2 px-2 hidden sm:table-cell">Trader</th>
            <th className="text-right py-2 px-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className="border-b border-border/30 hover:bg-elevated/50 transition-colors">
              <td className="py-2 px-2">
                <span className={cn('font-medium uppercase', trade.type === 'buy' ? 'text-bull' : 'text-bear')}>
                  {trade.type}
                </span>
              </td>
              <td className="text-right py-2 px-2 font-mono text-text-secondary">
                {formatTokenAmount(trade.tokenAmount)}
              </td>
              <td className="text-right py-2 px-2 font-mono text-text-primary">
                {formatBtc(trade.btcAmount)}
              </td>
              <td className="text-right py-2 px-2 font-mono text-text-muted hidden sm:table-cell">
                {shortenAddress(trade.traderAddress, 4)}
              </td>
              <td className="text-right py-2 px-2 text-text-muted">
                {timeAgo(trade.timestamp)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

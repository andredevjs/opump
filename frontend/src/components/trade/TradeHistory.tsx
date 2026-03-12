import { useState, useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import type { Trade } from '@/types/trade';
import { formatBtc, formatTokenAmount, shortenAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useTradeStore } from '@/stores/trade-store';
import * as api from '@/services/api';

const EMPTY_WS_TRADES: { txHash: string; type: 'buy' | 'sell'; traderAddress: string; btcAmount: string; tokenAmount: string; status: string; pricePerToken: string }[] = [];

interface TradeHistoryProps {
  token: Token;
}

export function TradeHistory({ token }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const wsTrades = useTradeStore((s) => s.recentTrades[token.address] ?? EMPTY_WS_TRADES);

  useEffect(() => {
    api.getTrades(token.address, 1, 50).then((res) => {
      // Map API trades to local Trade type
      const mapped: Trade[] = res.trades.map((t) => ({
        id: t._id,
        txHash: t._id,
        type: t.type,
        tokenAddress: t.tokenAddress,
        tokenAmount: String(t.tokenAmount),
        btcAmount: Number(t.btcAmount),
        priceSats: Number(t.pricePerToken || 0),
        fee: Number(t.fees?.platform || 0),
        traderAddress: t.traderAddress,
        timestamp: new Date(t.createdAt).getTime(),
        status: (t.status === 'confirmed' ? 'confirmed' : 'mempool') as Trade['status'],
      }));
      setTrades(mapped);
    }).catch((err) => {
      console.error('[TradeHistory] API error:', err);
      setTrades([]);
    });
  }, [token.address]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th scope="col" className="text-left py-2 px-2">Type</th>
            <th scope="col" className="text-right py-2 px-2">Amount</th>
            <th scope="col" className="text-right py-2 px-2">BTC</th>
            <th scope="col" className="text-right py-2 px-2 hidden sm:table-cell">Trader</th>
            <th scope="col" className="text-right py-2 px-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {/* WebSocket live trades (pending) at the top */}
          {wsTrades.map((trade) => (
            <tr key={trade.txHash} className={cn(
              'border-b border-border/30 transition-colors',
              trade.status === 'pending' ? 'bg-accent/5 animate-pulse' : 'hover:bg-elevated/50',
            )}>
              <td className="py-2 px-2">
                <span className="flex items-center gap-1">
                  {trade.status === 'pending' && (
                    <span className="inline-block w-2 h-2 rounded-full bg-accent animate-spin" />
                  )}
                  {trade.status === 'confirmed' && (
                    <span className="inline-block w-2 h-2 rounded-full bg-bull" />
                  )}
                  <span className={cn('font-medium uppercase', trade.type === 'buy' ? 'text-bull' : 'text-bear')}>
                    {trade.type}
                  </span>
                </span>
              </td>
              <td className="text-right py-2 px-2 font-mono text-text-secondary">
                {formatTokenAmount(trade.tokenAmount)}
              </td>
              <td className="text-right py-2 px-2 font-mono text-text-primary">
                {formatBtc(Number(trade.btcAmount))}
              </td>
              <td className="text-right py-2 px-2 font-mono text-text-muted hidden sm:table-cell">
                {shortenAddress(trade.traderAddress, 4)}
              </td>
              <td className="text-right py-2 px-2 text-text-muted">
                {trade.status === 'pending' ? 'now' : 'just now'}
              </td>
            </tr>
          ))}

          {/* Historical trades */}
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

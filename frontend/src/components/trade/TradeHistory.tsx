import { useState, useEffect, useCallback } from 'react';
import type { Token } from '@/types/token';
import type { Trade } from '@/types/trade';
import { formatUsd, formatTokenAmount, shortenAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useUIStore } from '@/stores/ui-store';
import { useBtcPrice } from '@/stores/btc-price-store';
import * as api from '@/services/api';

const POLL_INTERVAL_MS = 15_000;
/** Trades older than this are treated as confirmed for display (Bitcoin block time ~10min) */
const PENDING_AGE_THRESHOLD_MS = 15 * 60 * 1000;

interface TradeHistoryProps {
  token: Token;
}

export function TradeHistory({ token }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const tradeVersion = useUIStore((s) => s.tradeVersion);
  const { btcPrice } = useBtcPrice();

  const fetchTrades = useCallback(() => {
    api.getTrades(token.address, 1, 50).then((res) => {
      const now = Date.now();
      const mapped: Trade[] = res.trades.map((t) => {
        const timestamp = new Date(t.createdAt).getTime();
        const age = now - timestamp;
        // Per mempool-first architecture: trades older than ~15min are
        // effectively confirmed even if the indexer hasn't caught up yet.
        const isOldPending = t.status !== 'confirmed' && age > PENDING_AGE_THRESHOLD_MS;
        return {
          id: t._id,
          txHash: t._id,
          type: t.type,
          tokenAddress: t.tokenAddress,
          tokenAmount: String(t.tokenAmount),
          btcAmount: Number(t.btcAmount),
          priceSats: Number(t.pricePerToken || 0),
          fee: Number(t.fees?.platform || 0),
          traderAddress: t.traderAddress,
          timestamp,
          status: (t.status === 'confirmed' || isOldPending ? 'confirmed' : 'mempool') as Trade['status'],
        };
      });

      // Deduplicate: when a pending trade gets confirmed, both the optimistic
      // (pending) entry and the on-chain (confirmed) entry may coexist with
      // different TXIDs. Match duplicates by (type, trader, btcAmount) within
      // a time window and keep the confirmed version.
      const deduped: Trade[] = [];
      const seen = new Map<string, Trade>();
      for (const trade of mapped) {
        const key = `${trade.type}:${trade.traderAddress}:${trade.btcAmount}`;
        const existing = seen.get(key);
        if (existing && Math.abs(trade.timestamp - existing.timestamp) < PENDING_AGE_THRESHOLD_MS) {
          if (trade.status === 'confirmed' && existing.status === 'mempool') {
            const idx = deduped.indexOf(existing);
            if (idx !== -1) deduped[idx] = trade;
            seen.set(key, trade);
          } else if (trade.status === 'mempool' && existing.status === 'confirmed') {
            continue;
          } else {
            deduped.push(trade);
          }
        } else {
          seen.set(key, trade);
          deduped.push(trade);
        }
      }

      setTrades(deduped);
    }).catch((err) => {
      console.error('[TradeHistory] API error:', err);
    });
  }, [token.address]);

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTrades, tradeVersion]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th scope="col" className="text-left py-2 px-2">Type</th>
            <th scope="col" className="text-right py-2 px-2">Amount</th>
            <th scope="col" className="text-right py-2 px-2">Value</th>
            <th scope="col" className="text-right py-2 px-2 hidden sm:table-cell">Trader</th>
            <th scope="col" className="text-right py-2 px-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <tr key={trade.id} className={cn(
              'border-b border-border/30 transition-colors',
              trade.status !== 'confirmed' ? 'bg-accent/5 animate-pulse' : 'hover:bg-elevated/50',
            )}>
              <td className="py-2 px-2">
                <span className="flex items-center gap-1">
                  {trade.status !== 'confirmed' && (
                    <span className="inline-block w-2 h-2 rounded-full bg-accent animate-spin" />
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
                {formatUsd(trade.btcAmount, btcPrice)}
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

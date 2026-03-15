import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Token } from '@/types/token';
import type { Trade } from '@/types/trade';
import { formatBtc, formatTokenAmount, shortenAddress, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useTradeStore } from '@/stores/trade-store';
import * as api from '@/services/api';

const EMPTY_WS_TRADES: { txHash: string; type: 'buy' | 'sell'; traderAddress: string; btcAmount: string; tokenAmount: string; status: string; pricePerToken: string }[] = [];
const POLL_INTERVAL_MS = 15_000;
const FAST_POLL_INTERVAL_MS = 5_000;
/** Trades older than this are treated as confirmed for display (Bitcoin block time ~10min) */
const PENDING_AGE_THRESHOLD_MS = 15 * 60 * 1000;

interface TradeHistoryProps {
  token: Token;
}

export function TradeHistory({ token }: TradeHistoryProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const wsTrades = useTradeStore((s) => s.recentTrades[token.address] ?? EMPTY_WS_TRADES);

  // S29: Deduplicate — filter out API trades whose txHash already appears in WS trades
  const wsTradeHashes = useMemo(() => new Set(wsTrades.map((t) => t.txHash)), [wsTrades]);
  const deduplicatedTrades = useMemo(
    () => trades.filter((t) => !wsTradeHashes.has(t.txHash)),
    [trades, wsTradeHashes],
  );

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
      setTrades(mapped);

      // Reconcile: if API shows a trade as confirmed but the WS entry is still
      // pending (no WebSocket server in Netlify to push trade_confirmed), update it.
      const store = useTradeStore.getState();
      const wsTradesForToken = store.recentTrades[token.address] ?? [];
      for (const apiTrade of res.trades) {
        if (apiTrade.status === 'confirmed') {
          const wsTrade = wsTradesForToken.find((t) => t.txHash === apiTrade._id);
          if (wsTrade && wsTrade.status !== 'confirmed') {
            store.confirmWsTrade(token.address, apiTrade._id);
          }
        }
      }
    }).catch((err) => {
      console.error('[TradeHistory] API error:', err);
    });
  }, [token.address]);

  // Poll faster when there are pending trades (API or WS) so status updates quickly
  const hasPending = useMemo(
    () => trades.some((t) => t.status !== 'confirmed') || wsTrades.some((t) => t.status !== 'confirmed'),
    [trades, wsTrades],
  );
  const pollMs = hasPending ? FAST_POLL_INTERVAL_MS : POLL_INTERVAL_MS;

  // When pending trades exist, trigger the indexer so it processes any new blocks
  // (scheduled function may not run on deploy previews)
  const indexerTriggered = useRef(false);
  useEffect(() => {
    if (hasPending && !indexerTriggered.current) {
      indexerTriggered.current = true;
      api.triggerIndexer().finally(() => {
        // Allow re-triggering after 30s if still pending
        setTimeout(() => { indexerTriggered.current = false; }, 30_000);
      });
    }
  }, [hasPending]);

  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, pollMs);
    return () => clearInterval(id);
  }, [fetchTrades, pollMs]);

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

          {/* Historical trades (deduplicated against WS trades) */}
          {deduplicatedTrades.map((trade) => (
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

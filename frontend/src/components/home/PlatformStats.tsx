import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { formatUsd, formatNumber } from '@/lib/format';
import { usePlatformStatsStore } from '@/stores/platform-stats-store';
import { useBtcPrice } from '@/stores/btc-price-store';
import * as api from '@/services/api';

const POLL_INTERVAL_MS = 5_000;

export function PlatformStats() {
  const [polledStats, setPolledStats] = useState({
    totalTokens: 0,
    totalGraduated: 0,
    totalVolumeSats: 0,
    totalTrades: 0,
  });

  // Prefer globally-polled stats from the global feed
  const globalStats = usePlatformStatsStore((s) => s.stats);

  const stats = globalStats ?? polledStats;
  const { btcPrice } = useBtcPrice();

  const refresh = useCallback(() => {
    api.getStats().then((s) => {
      setPolledStats({
        totalTokens: s.totalTokens,
        totalGraduated: s.totalGraduated,
        totalVolumeSats: Number(s.totalVolumeSats),
        totalTrades: s.totalTrades,
      });
    }).catch((err) => {
      console.error('[PlatformStats] API error:', err);
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const items = [
    { label: 'OP20 Tokens Launched', value: formatNumber(stats.totalTokens) },
    { label: 'Graduated to DEX', value: formatNumber(stats.totalGraduated) },
    { label: 'Total Volume', value: formatUsd(stats.totalVolumeSats, btcPrice) },
    { label: 'Total Trades', value: formatNumber(stats.totalTrades) },
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 mt-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <Card key={item.label} className="text-center py-6">
            <p className="text-2xl sm:text-3xl font-bold font-mono text-accent">{item.value}</p>
            <p className="text-sm text-text-secondary mt-1">{item.label}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

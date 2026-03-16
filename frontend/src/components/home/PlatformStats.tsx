import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { formatBtc, formatNumber } from '@/lib/format';
import { usePlatformStatsStore } from '@/stores/platform-stats-store';
import * as api from '@/services/api';

const POLL_INTERVAL_MS = 5_000;

export function PlatformStats() {
  const [polledStats, setPolledStats] = useState({
    totalTokens: 0,
    totalGraduated: 0,
    totalVolumeSats: 0,
    totalTrades: 0,
  });

  // T017: Prefer WS-delivered stats from the global feed
  const wsStats = usePlatformStatsStore((s) => s.stats);

  const stats = wsStats ?? polledStats;

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
    { label: 'Tokens Launched', value: formatNumber(stats.totalTokens) },
    { label: 'Graduated to DEX', value: formatNumber(stats.totalGraduated) },
    { label: 'Total Volume', value: formatBtc(stats.totalVolumeSats) },
    { label: 'Total Trades', value: formatNumber(stats.totalTrades) },
  ];

  return (
    <section className="max-w-7xl mx-auto px-4 -mt-8">
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

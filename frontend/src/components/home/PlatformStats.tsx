import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { formatBtc, formatNumber } from '@/lib/format';
import * as api from '@/services/api';

export function PlatformStats() {
  const [stats, setStats] = useState({
    totalTokens: 0,
    totalGraduated: 0,
    totalVolumeSats: 0,
    totalTrades: 0,
  });

  useEffect(() => {
    api.getStats().then((s) => {
      setStats({
        totalTokens: s.totalTokens,
        totalGraduated: s.totalGraduated,
        totalVolumeSats: Number(s.totalVolumeSats),
        totalTrades: s.totalTrades,
      });
    }).catch((err) => {
      console.error('[PlatformStats] API error:', err);
    });
  }, []);

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

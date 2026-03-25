import { useEffect } from 'react';
import { Fuel } from 'lucide-react';
import { useFeeStore } from '@/stores/fee-store';

export function FeeTracker() {
  const fees = useFeeStore((s) => s.fees);
  const loading = useFeeStore((s) => s.loading);
  const startPolling = useFeeStore((s) => s.startPolling);

  useEffect(() => startPolling(), [startPolling]);

  if (loading || !fees) return null;

  return (
    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-xs">
      <Fuel size={14} className="text-text-muted" />
      <span className="font-mono text-text-secondary">{fees.fastestFee}</span>
      <span className="text-text-muted">sat/vB</span>
    </div>
  );
}

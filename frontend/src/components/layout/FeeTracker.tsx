import { useEffect } from 'react';
import { Fuel, Bitcoin } from 'lucide-react';
import { useFeeStore } from '@/stores/fee-store';
import { useBtcPrice } from '@/stores/btc-price-store';

export function FeeTracker() {
  const fees = useFeeStore((s) => s.fees);
  const loading = useFeeStore((s) => s.loading);
  const startPolling = useFeeStore((s) => s.startPolling);
  const { btcPrice } = useBtcPrice();

  useEffect(() => startPolling(), [startPolling]);

  if (loading || !fees) return null;

  const formattedPrice = btcPrice > 0
    ? btcPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;

  return (
    <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-elevated border border-border text-xs">
      <Fuel size={14} className="text-text-muted" />
      <span className="font-mono text-text-secondary">{fees.fastestFee}</span>
      <span className="text-text-muted">sat/vB</span>
      {formattedPrice && (
        <>
          <span className="text-border mx-0.5">|</span>
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F7931A]">
            <Bitcoin size={12} className="text-white" />
          </span>
          <span className="font-mono text-text-secondary">{formattedPrice}</span>
        </>
      )}
    </div>
  );
}

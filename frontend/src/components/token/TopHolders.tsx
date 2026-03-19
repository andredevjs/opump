import { useState, useEffect, useRef, useCallback } from 'react';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { Skeleton } from '@/components/ui/Skeleton';
import { getTokenHolders } from '@/services/api';
import type { HolderEntry } from '@shared/types/api';

interface TopHoldersProps {
  tokenAddress: string;
}

const POLL_INTERVAL_MS = 30_000;

export function TopHolders({ tokenAddress }: TopHoldersProps) {
  const [holders, setHolders] = useState<HolderEntry[]>([]);
  const [holderCount, setHolderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchHolders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await getTokenHolders(tokenAddress);
      setHolders(data.holders);
      setHolderCount(data.holderCount);
    } catch {
      // Silent error — don't break the page
    } finally {
      setLoading(false);
    }
  }, [tokenAddress]);

  useEffect(() => {
    fetchHolders();

    intervalRef.current = setInterval(() => fetchHolders(true), POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchHolders]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="text-text-muted">Holders</span>
        <p className="font-mono text-text-primary mt-1">{holderCount.toLocaleString()}</p>
      </div>

      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Top Holders</h4>
        {holders.length === 0 ? (
          <p className="text-text-muted text-sm">No holders yet</p>
        ) : (
          <ul className="space-y-1.5">
            {holders.map((h) => (
              <li key={h.address} className="flex items-center justify-between text-sm">
                <AddressDisplay address={h.address} showCopy />
                <span className="font-mono text-text-primary ml-2 shrink-0">
                  {formatHolderPercent(h.percent)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatHolderPercent(percent: number): string {
  if (percent <= 0) return '0%';
  if (percent < 0.1) return '< 0.1%';
  return `${percent.toFixed(2)}%`;
}

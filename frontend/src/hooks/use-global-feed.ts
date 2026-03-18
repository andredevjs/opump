import { useEffect, useRef } from 'react';
import { useTokenStore } from '@/stores/token-store';
import { usePlatformStatsStore } from '@/stores/platform-stats-store';
import { mapApiTokenToToken } from '@/lib/mappers';
import * as api from '@/services/api';

const POLL_INTERVAL_MS = 5000;

/**
 * Global polling feed — mounted once in RootLayout.
 * Polls platform stats and newest tokens on an interval,
 * dispatching updates to stores.
 */
export function useGlobalFeed(): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function poll() {
      // Fetch platform stats
      api.getStats().then((stats) => {
        usePlatformStatsStore.getState().setStats({
          totalTokens: stats.totalTokens,
          totalTrades: stats.totalTrades,
          totalVolumeSats: Number(stats.totalVolumeSats),
          totalGraduated: stats.totalGraduated,
        });
      }).catch(() => {/* ignore */});

      // Fetch newest tokens to detect new_token and status changes
      api.getTokens({ sort: 'newest', limit: 5 }).then((resp) => {
        const { tokens: storeTokens, filter, updateTokenStatus } = useTokenStore.getState();
        const hasActiveFilter = !!(filter.search || filter.status !== 'all');
        for (const apiToken of resp.tokens) {
          try {
            const mapped = mapApiTokenToToken(apiToken);
            const existing = storeTokens.find((t) => t.address === mapped.address);
            if (!existing) {
              // New token — prepend only when no search/status filter is active;
              // TrenchesPage's own poll already handles filtered refreshes.
              if (!hasActiveFilter) {
                useTokenStore.setState((state) => ({
                  tokens: [mapped, ...state.tokens],
                }));
              }
            } else if (existing.status !== mapped.status) {
              // Status changed (graduated, migrating, migrated)
              updateTokenStatus(mapped.address, mapped.status);
            }
          } catch {
            // Malformed payload — ignore
          }
        }
      }).catch(() => {/* ignore */});
    }

    // Initial poll
    poll();

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}

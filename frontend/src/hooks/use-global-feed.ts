import { useEffect, useRef } from 'react';
import { wsClient } from '@/services/websocket';
import { useTokenStore } from '@/stores/token-store';
import { usePlatformStatsStore } from '@/stores/platform-stats-store';
import { mapApiTokenToToken } from '@/lib/mappers';
import * as api from '@/services/api';
import type { TokenStatus } from '@/types/token';

interface TokenActivityData {
  tokenAddress: string;
  lastPrice: string;
  volume24h: string;
  btcAmount: string;
}

interface PlatformStatsData {
  totalTokens: number;
  totalTrades: number;
  totalVolumeSats: string;
  totalGraduated: number;
}

interface TokenStatusEventData {
  tokenAddress: string;
}

function isTokenActivity(d: unknown): d is TokenActivityData {
  return d !== null && typeof d === 'object' && 'tokenAddress' in d && 'lastPrice' in d;
}

function isPlatformStats(d: unknown): d is PlatformStatsData {
  return d !== null && typeof d === 'object' && 'totalTokens' in d;
}

function isTokenStatusEvent(d: unknown): d is TokenStatusEventData {
  return d !== null && typeof d === 'object' && 'tokenAddress' in d;
}

/**
 * Global WebSocket feed — mounted once in RootLayout.
 * Subscribes to the `platform` channel and dispatches events to stores.
 */
export function useGlobalFeed(): void {
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = wsClient.subscribe('platform', undefined, (event, data) => {
      switch (event) {
        case 'token_activity': {
          if (!isTokenActivity(data)) return;
          const { tokens, updateTokenPrice, updateTokenStats } = useTokenStore.getState();
          const match = tokens.find((t) => t.address === data.tokenAddress);
          if (match) {
            updateTokenPrice(data.tokenAddress, parseFloat(data.lastPrice), match.priceChange24h);
            updateTokenStats(data.tokenAddress, {
              volume24hSats: parseFloat(data.volume24h),
            });
          }
          // Throttled full refetch to correct computed fields (priceChange24hBps)
          if (!throttleRef.current) {
            throttleRef.current = setTimeout(() => {
              throttleRef.current = null;
              useTokenStore.getState().fetchTokens();
            }, 2500);
          }
          break;
        }

        case 'new_token': {
          if (!data || typeof data !== 'object') return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const token = mapApiTokenToToken(data as any);
            useTokenStore.setState((state) => ({
              tokens: [token, ...state.tokens],
            }));
          } catch {
            // Malformed payload — ignore
          }
          break;
        }

        case 'platform_stats_update': {
          if (!isPlatformStats(data)) return;
          usePlatformStatsStore.getState().setStats({
            totalTokens: data.totalTokens,
            totalTrades: data.totalTrades,
            totalVolumeSats: Number(data.totalVolumeSats),
            totalGraduated: data.totalGraduated,
          });
          break;
        }

        case 'token_graduated':
        case 'token_migrating':
        case 'token_migrated': {
          if (!isTokenStatusEvent(data)) return;
          const statusMap: Record<string, TokenStatus> = {
            token_graduated: 'graduated',
            token_migrating: 'migrating',
            token_migrated: 'migrated',
          };
          const newStatus = statusMap[event];
          if (newStatus) {
            useTokenStore.getState().updateTokenStatus(data.tokenAddress, newStatus);
          }
          break;
        }
      }
    });

    // On WS reconnect: refetch platform stats and token list
    const unsubReconnect = wsClient.onReconnect(() => {
      api.getStats().then((stats) => {
        usePlatformStatsStore.getState().setStats({
          totalTokens: stats.totalTokens,
          totalTrades: stats.totalTrades,
          totalVolumeSats: Number(stats.totalVolumeSats),
          totalGraduated: stats.totalGraduated,
        });
      }).catch(() => {/* ignore */});
      useTokenStore.getState().fetchTokens();
    });

    return () => {
      unsub();
      unsubReconnect();
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, []);
}

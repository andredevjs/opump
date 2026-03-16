import type { WebSocketService } from './WebSocketService.js';

export interface TokenStatsPayload {
  volume24h: string;
  volumeTotal: string;
  tradeCount: number;
  tradeCount24h: number;
  holderCount: number;
  marketCapSats: string;
}

export interface PlatformStatsPayload {
  totalTokens: number;
  totalTrades: number;
  totalVolumeSats: string;
  totalGraduated: number;
}

export interface TokenActivityPayload {
  tokenAddress: string;
  lastPrice: string;
  volume24h: string;
  btcAmount: string;
}

interface TokenTimer {
  timer: ReturnType<typeof setTimeout>;
  lastActivity: number;
  data: TokenStatsPayload;
}

const TOKEN_DEBOUNCE_MS = 2000;
const PLATFORM_DEBOUNCE_MS = 3000;
const INACTIVE_TTL_MS = 600_000; // 10 minutes
const EVICTION_INTERVAL_MS = 60_000; // 1 minute

export class BroadcastDebouncer {
  private tokenTimers = new Map<string, TokenTimer>();
  private platformTimer: ReturnType<typeof setTimeout> | null = null;
  private platformData: PlatformStatsPayload | null = null;
  private evictionInterval: ReturnType<typeof setInterval>;

  constructor(private wsService: WebSocketService) {
    this.evictionInterval = setInterval(() => this.evictInactive(), EVICTION_INTERVAL_MS);
  }

  /**
   * Schedule a debounced token_stats_update broadcast.
   * Trailing-edge: latest data wins, timer resets on each call.
   */
  scheduleTokenStats(tokenAddress: string, stats: TokenStatsPayload): void {
    const existing = this.tokenTimers.get(tokenAddress);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.tokenTimers.delete(tokenAddress);
      this.wsService.broadcast(`token:stats:${tokenAddress}`, 'token_stats_update', stats);
    }, TOKEN_DEBOUNCE_MS);

    this.tokenTimers.set(tokenAddress, {
      timer,
      lastActivity: Date.now(),
      data: stats,
    });
  }

  /**
   * Schedule a debounced platform_stats_update broadcast.
   * Trailing-edge: latest data wins, timer resets on each call.
   */
  schedulePlatformStats(stats: PlatformStatsPayload): void {
    if (this.platformTimer) {
      clearTimeout(this.platformTimer);
    }
    this.platformData = stats;

    this.platformTimer = setTimeout(() => {
      this.platformTimer = null;
      if (this.platformData) {
        this.wsService.broadcast('platform', 'platform_stats_update', this.platformData);
        this.platformData = null;
      }
    }, PLATFORM_DEBOUNCE_MS);
  }

  /**
   * Immediately broadcast token_activity (no debounce).
   * Lightweight signal for listing pages to locally patch displayed data.
   */
  tokenActivity(tokenAddress: string, data: TokenActivityPayload): void {
    this.wsService.broadcast('platform', 'token_activity', data);
  }

  /**
   * Evict timers for tokens with no activity for INACTIVE_TTL_MS.
   * Called periodically to prevent memory leaks.
   */
  private evictInactive(): void {
    const now = Date.now();
    for (const [address, entry] of this.tokenTimers) {
      if (now - entry.lastActivity > INACTIVE_TTL_MS) {
        clearTimeout(entry.timer);
        this.tokenTimers.delete(address);
      }
    }
  }

  /**
   * Flush all pending broadcasts immediately. Called on shutdown.
   */
  flush(): void {
    // Flush all pending token stats
    for (const [address, entry] of this.tokenTimers) {
      clearTimeout(entry.timer);
      this.wsService.broadcast(`token:stats:${address}`, 'token_stats_update', entry.data);
    }
    this.tokenTimers.clear();

    // Flush platform stats
    if (this.platformTimer) {
      clearTimeout(this.platformTimer);
      this.platformTimer = null;
    }
    if (this.platformData) {
      this.wsService.broadcast('platform', 'platform_stats_update', this.platformData);
      this.platformData = null;
    }
  }

  /**
   * Stop all timers including the eviction interval.
   */
  stop(): void {
    clearInterval(this.evictionInterval);

    for (const [, entry] of this.tokenTimers) {
      clearTimeout(entry.timer);
    }
    this.tokenTimers.clear();

    if (this.platformTimer) {
      clearTimeout(this.platformTimer);
      this.platformTimer = null;
    }
    this.platformData = null;
  }
}

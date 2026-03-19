import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { useUIStore } from '@/stores/ui-store';
import { PRICE_UPDATE_INTERVAL_MS, INITIAL_VIRTUAL_TOKEN_SUPPLY, GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import type { TimeframeKey, OHLCVCandle } from '@/types/api';
import type { TradeDocument } from '@shared/types/trade';
import * as api from '@/services/api';
import { computeOptimistic24hChange } from '@/lib/price-utils';

const TIMEFRAME_SECONDS: Record<TimeframeKey, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

/** Build OHLCV candles from raw trade documents (fallback when OHLCV endpoint returns empty) */
function buildCandlesFromTrades(trades: TradeDocument[], tf: TimeframeKey): OHLCVCandle[] {
  const bucketSeconds = TIMEFRAME_SECONDS[tf];
  const buckets = new Map<number, OHLCVCandle>();

  // Deduplicate: when a pending trade gets confirmed, both versions appear in the
  // trade list. Build a set of confirmed trade signatures so we can skip the stale
  // pending duplicate (which has a no-fee price that conflicts with the real price).
  const confirmedKeys = new Set<string>();
  for (const t of trades) {
    if (t.status === 'confirmed') {
      confirmedKeys.add(`${t.tokenAddress}:${t.btcAmount}:${t.tokenAmount}`);
    }
  }

  // trades are newest-first from API, reverse for chronological order
  const sorted = [...trades].reverse();

  for (const t of sorted) {
    // Skip pending trades that have a confirmed counterpart
    if (t.status === 'pending' && confirmedKeys.has(`${t.tokenAddress}:${t.btcAmount}:${t.tokenAmount}`)) {
      continue;
    }
    const price = Number(t.pricePerToken);
    const volume = Number(t.btcAmount);
    if (!price || isNaN(price)) continue;

    const tsSec = Math.floor(new Date(t.createdAt).getTime() / 1000);
    const bucket = Math.floor(tsSec / bucketSeconds) * bucketSeconds;

    const existing = buckets.get(bucket);
    if (existing) {
      existing.high = Math.max(existing.high, price);
      existing.low = Math.min(existing.low, price);
      existing.close = price;
      existing.volume += volume;
    } else {
      buckets.set(bucket, { time: bucket, open: price, high: price, low: price, close: price, volume });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Merge trade-built candles into OHLCV candles.
 * For non-overlapping buckets, trade candles fill gaps not yet covered
 * by the indexer. For overlapping buckets, trade data is merged in
 * (expand high/low, prefer trade close which may include pending trades).
 */
function mergeTradeCandles(ohlcv: OHLCVCandle[], trades: TradeDocument[], tf: TimeframeKey): OHLCVCandle[] {
  if (trades.length === 0) return ohlcv;
  const tradeCandles = buildCandlesFromTrades(trades, tf);
  if (tradeCandles.length === 0) return ohlcv;
  if (ohlcv.length === 0) return tradeCandles;

  const resultMap = new Map<number, OHLCVCandle>();
  for (const c of ohlcv) {
    resultMap.set(c.time, { ...c });
  }

  for (const tc of tradeCandles) {
    const existing = resultMap.get(tc.time);
    if (existing) {
      existing.high = Math.max(existing.high, tc.high);
      existing.low = Math.min(existing.low, tc.low);
      existing.close = tc.close;
      existing.volume = Math.max(existing.volume, tc.volume);
    } else {
      resultMap.set(tc.time, { ...tc });
    }
  }

  return Array.from(resultMap.values()).sort((a, b) => a.time - b.time);
}

export function usePriceFeed(token: Token | null, timeframe: TimeframeKey = '15m') {
  const tradeVersion = useUIStore((s) => s.tradeVersion);
  const updateTokenPrice = useTokenStore((s) => s.updateTokenPrice);
  const setCandles = usePriceStore((s) => s.setCandles);
  const setLoading = usePriceStore((s) => s.setLoading);
  const setLivePrice = usePriceStore((s) => s.setLivePrice);
  const setActiveTimeframe = usePriceStore((s) => s.setActiveTimeframe);
  const intervalRef = useRef<number>();
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  useEffect(() => {
    if (!token) return;

    // Track active timeframe so optimistic trades can update candles
    setActiveTimeframe(token.address, timeframe);

    // Only show loading if we have no candles yet (preserves optimistic data)
    const existing = usePriceStore.getState().candles[token.address];
    if (!existing || existing.length === 0) {
      setLoading(token.address, true);
    }

    let cancelled = false;

    const updateTokenStats = useTokenStore.getState().updateTokenStats;

    function refreshFromServer() {
      if (!token) return;
      const addr = token.address;
      Promise.all([
        api.getOHLCV(addr, timeframeRef.current),
        api.getTrades(addr, 1, 200).catch(() => ({ trades: [] as TradeDocument[] })),
        api.getTokenPrice(addr).catch(() => null),
      ]).then(([ohlcvResp, tradesResp, priceResp]) => {
        if (cancelled) return;
        const merged = mergeTradeCandles(ohlcvResp.candles, tradesResp.trades, timeframeRef.current);
        if (merged.length > 0) {
          setCandles(addr, merged);
        }
        if (priceResp) {
          setLivePrice(addr, {
            currentPriceSats: priceResp.currentPriceSats,
            virtualBtcReserve: priceResp.virtualBtcReserve,
            virtualTokenSupply: priceResp.virtualTokenSupply,
            realBtcReserve: priceResp.realBtcReserve,
            isOptimistic: priceResp.isOptimistic,
          });
          updateTokenPrice(addr, Number(priceResp.currentPriceSats), priceResp.change24hBps / 100);

          // Update market cap and graduation progress from price data
          if (priceResp.virtualBtcReserve != null && priceResp.virtualTokenSupply != null) {
            const vBtc = Number(priceResp.virtualBtcReserve);
            const vToken = Number(priceResp.virtualTokenSupply);
            const initSupply = INITIAL_VIRTUAL_TOKEN_SUPPLY.toNumber();
            const marketCapSats = vToken > 0 ? (vBtc / vToken) * initSupply : 0;
            const statsUpdate: { marketCapSats: number; realBtcReserve?: string; graduationProgress?: number } = { marketCapSats };
            if (priceResp.realBtcReserve != null) {
              statsUpdate.realBtcReserve = priceResp.realBtcReserve;
              const rBtc = Number(priceResp.realBtcReserve);
              statsUpdate.graduationProgress = GRADUATION_THRESHOLD_SATS > 0
                ? Math.min(100, (rBtc / GRADUATION_THRESHOLD_SATS) * 100)
                : 0;
            }
            updateTokenStats(token.address, statsUpdate);
          }
        }
        setLoading(addr, false);
      }).catch(() => {
        if (!cancelled) {
          setLoading(token.address, false);
        }
      });
    }

    // Initial fetch
    refreshFromServer();

    // Poll for price, candles, and trades at PRICE_UPDATE_INTERVAL_MS
    let consecutiveFailures = 0;

    intervalRef.current = window.setInterval(() => {
      api.getTokenPrice(token.address).then((price) => {
        if (cancelled) return;
        consecutiveFailures = 0;
        const newPrice = Number(price.currentPriceSats);
        setLivePrice(token.address, {
          currentPriceSats: price.currentPriceSats,
          virtualBtcReserve: price.virtualBtcReserve,
          virtualTokenSupply: price.virtualTokenSupply,
          realBtcReserve: price.realBtcReserve,
          isOptimistic: price.isOptimistic,
        });

        // Recalculate 24h change
        const existing = useTokenStore.getState().selectedToken;
        const oldPrice = existing?.address === token.address ? existing.currentPriceSats : 0;
        const oldChange = existing?.address === token.address ? existing.priceChange24h : 0;
        const newChange = computeOptimistic24hChange(oldPrice, oldChange, newPrice);
        updateTokenPrice(token.address, newPrice, newChange);

        // Update market cap and graduation progress
        if (price.virtualBtcReserve != null && price.virtualTokenSupply != null) {
          const vBtc = Number(price.virtualBtcReserve);
          const vToken = Number(price.virtualTokenSupply);
          const initSupply = INITIAL_VIRTUAL_TOKEN_SUPPLY.toNumber();
          const marketCapSats = vToken > 0 ? (vBtc / vToken) * initSupply : 0;
          const statsUpdate: { marketCapSats: number; realBtcReserve?: string; graduationProgress?: number } = { marketCapSats };
          if (price.realBtcReserve != null) {
            statsUpdate.realBtcReserve = price.realBtcReserve;
            const rBtc = Number(price.realBtcReserve);
            statsUpdate.graduationProgress = GRADUATION_THRESHOLD_SATS > 0
              ? Math.min(100, (rBtc / GRADUATION_THRESHOLD_SATS) * 100)
              : 0;
          }
          updateTokenStats(token.address, statsUpdate);
        }
      }).catch(() => {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          console.warn(`[usePriceFeed] ${consecutiveFailures} consecutive polling failures for ${token.address}`);
        }
      });

      Promise.all([
        api.getOHLCV(token.address, timeframeRef.current),
        api.getTrades(token.address, 1, 200).catch(() => ({ trades: [] as TradeDocument[] })),
      ]).then(([ohlcvResp, tradesResp]) => {
        if (cancelled) return;
        const merged = mergeTradeCandles(ohlcvResp.candles, tradesResp.trades, timeframeRef.current);
        if (merged.length > 0) {
          setCandles(token.address, merged);
        }
      }).catch(() => { /* best-effort */ });
    }, PRICE_UPDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      setLoading(token.address, false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when token.address changes, not the full object
  }, [token?.address, timeframe, tradeVersion, setLoading, setCandles, updateTokenPrice,
      setLivePrice, setActiveTimeframe]);
}

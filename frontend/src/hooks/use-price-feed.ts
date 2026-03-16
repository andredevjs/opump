import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { useTradeStore } from '@/stores/trade-store';
import { PRICE_UPDATE_INTERVAL_MS, INITIAL_VIRTUAL_TOKEN_SUPPLY, GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import type { TimeframeKey, OHLCVCandle } from '@/types/api';
import type { TradeDocument } from '@shared/types/trade';
import { wsClient } from '@/services/websocket';
import * as api from '@/services/api';
import { computeOptimistic24hChange } from '@/lib/price-utils';

// W16-W17: Runtime type guards for WebSocket data
interface PriceWsData {
  currentPriceSats?: string;
  virtualBtcReserve?: string;
  virtualTokenSupply?: string;
  realBtcReserve?: string;
  isOptimistic?: boolean;
}

interface TradeWsData {
  txHash: string;
  type: 'buy' | 'sell';
  traderAddress: string;
  btcAmount: string;
  tokenAmount: string;
  status: string;
  pricePerToken: string;
  reason?: string;
}

function isPriceData(d: unknown): d is PriceWsData {
  return d !== null && typeof d === 'object';
}

function isTradeData(d: unknown): d is TradeWsData {
  return d !== null && typeof d === 'object' && 'txHash' in d && 'type' in d;
}

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

  // trades are newest-first from API, reverse for chronological order
  const sorted = [...trades].reverse();

  for (const t of sorted) {
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
 * OHLCV candles take priority (indexed on-chain data); trade candles fill
 * time buckets not yet covered by the indexer — this ensures pending trades
 * appear on the chart immediately.
 */
function mergeTradeCandles(ohlcv: OHLCVCandle[], trades: TradeDocument[], tf: TimeframeKey): OHLCVCandle[] {
  if (trades.length === 0) return ohlcv;
  const tradeCandles = buildCandlesFromTrades(trades, tf);
  if (tradeCandles.length === 0) return ohlcv;
  if (ohlcv.length === 0) return tradeCandles;

  const ohlcvTimes = new Set(ohlcv.map((c) => c.time));
  const newCandles = tradeCandles.filter((c) => !ohlcvTimes.has(c.time));
  if (newCandles.length === 0) return ohlcv;

  return [...ohlcv, ...newCandles].sort((a, b) => a.time - b.time);
}

export function usePriceFeed(token: Token | null, timeframe: TimeframeKey = '15m') {
  const updateTokenPrice = useTokenStore((s) => s.updateTokenPrice);
  const setCandles = usePriceStore((s) => s.setCandles);
  const setLoading = usePriceStore((s) => s.setLoading);
  const appendCandle = usePriceStore((s) => s.appendCandle);
  const updateLastCandle = usePriceStore((s) => s.updateLastCandle);
  const setLivePrice = usePriceStore((s) => s.setLivePrice);
  const setActiveTimeframe = usePriceStore((s) => s.setActiveTimeframe);
  const addWsTrade = useTradeStore((s) => s.addWsTrade);
  const confirmWsTrade = useTradeStore((s) => s.confirmWsTrade);
  const dropWsTrade = useTradeStore((s) => s.dropWsTrade);
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
    // Fetch OHLCV, trades, and price (for 24h change) in parallel
    Promise.all([
      api.getOHLCV(token.address, timeframe),
      api.getTrades(token.address, 1, 200).catch(() => ({ trades: [] as TradeDocument[] })),
      api.getTokenPrice(token.address).catch(() => null),
    ]).then(([ohlcvResp, tradesResp, priceResp]) => {
      if (cancelled) return;
      const merged = mergeTradeCandles(ohlcvResp.candles, tradesResp.trades, timeframe);
      if (merged.length > 0) {
        setCandles(token.address, merged);
      }
      // Seed 24h change from price endpoint
      if (priceResp) {
        updateTokenPrice(token.address, Number(priceResp.currentPriceSats), priceResp.change24hBps / 100);
      }
      setLoading(token.address, false);
    }).catch(() => {
      if (!cancelled) {
        setLoading(token.address, false);
      }
    });

    wsClient.connect();

    const updateTokenStats = useTokenStore.getState().updateTokenStats;
    const unsubPrice = wsClient.subscribe('token:price', token.address, (_event, data) => {
      if (!isPriceData(data)) return;
      const d = data;

      // Merge with existing — don't overwrite reserves with undefined
      setLivePrice(token.address, d);
      if (d.currentPriceSats != null) {
        // Recalculate 24h change from reference price — WS events don't carry it
        const existing = useTokenStore.getState().selectedToken;
        const oldPrice = existing?.address === token.address ? existing.currentPriceSats : 0;
        const oldChange = existing?.address === token.address ? existing.priceChange24h : 0;
        const newChange = computeOptimistic24hChange(oldPrice, oldChange, Number(d.currentPriceSats));
        updateTokenPrice(token.address, Number(d.currentPriceSats), newChange);
      }

      // Update market cap and graduation progress from WS reserve data
      if (d.virtualBtcReserve != null && d.virtualTokenSupply != null) {
        const vBtc = Number(d.virtualBtcReserve);
        const vToken = Number(d.virtualTokenSupply);
        const initSupply = INITIAL_VIRTUAL_TOKEN_SUPPLY.toNumber();
        const marketCapSats = vToken > 0 ? (vBtc / vToken) * initSupply : 0;
        const statsUpdate: { marketCapSats: number; realBtcReserve?: string; graduationProgress?: number } = { marketCapSats };
        if (d.realBtcReserve != null) {
          statsUpdate.realBtcReserve = d.realBtcReserve;
          const rBtc = Number(d.realBtcReserve);
          statsUpdate.graduationProgress = GRADUATION_THRESHOLD_SATS > 0
            ? Math.min(100, (rBtc / GRADUATION_THRESHOLD_SATS) * 100)
            : 0;
        }
        updateTokenStats(token.address, statsUpdate);
      }
    });

    const unsubTrades = wsClient.subscribe('token:trades', token.address, (event, data) => {
      if (!isTradeData(data)) return;
      const d = data;

      if (event === 'new_trade') {
        addWsTrade(token.address, d);

        // Update candle chart in real time
        const tf = timeframeRef.current;
        const bucketSeconds = TIMEFRAME_SECONDS[tf];
        const nowSec = Math.floor(Date.now() / 1000);
        const bucketTime = Math.floor(nowSec / bucketSeconds) * bucketSeconds;
        const price = Number(d.pricePerToken);
        const volume = Number(d.btcAmount);

        const candles = usePriceStore.getState().candles[token.address] ?? [];
        const last = candles[candles.length - 1];

        if (last && last.time === bucketTime) {
          updateLastCandle(token.address, {
            time: bucketTime,
            open: last.open,
            high: Math.max(last.high, price),
            low: Math.min(last.low, price),
            close: price,
            volume: last.volume + volume,
          });
        } else {
          appendCandle(token.address, {
            time: bucketTime,
            open: price,
            high: price,
            low: price,
            close: price,
            volume,
          });
        }
      } else if (event === 'trade_confirmed') {
        confirmWsTrade(token.address, d.txHash);
      } else if (event === 'trade_dropped') {
        dropWsTrade(token.address, d.txHash);
      }
    });

    // W12: Track consecutive polling failures and log after threshold
    let consecutiveFailures = 0;

    // Fallback polling in case WebSocket disconnects — refresh both price and chart
    intervalRef.current = window.setInterval(() => {
      if (!wsClient.isConnected()) {
        api.getTokenPrice(token.address).then((price) => {
          consecutiveFailures = 0;
          setLivePrice(token.address, {
            currentPriceSats: price.currentPriceSats,
            virtualBtcReserve: price.virtualBtcReserve,
            virtualTokenSupply: price.virtualTokenSupply,
            realBtcReserve: price.realBtcReserve,
            isOptimistic: price.isOptimistic,
          });
          updateTokenPrice(token.address, Number(price.currentPriceSats), price.change24hBps / 100);
        }).catch(() => {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            console.warn(`[usePriceFeed] ${consecutiveFailures} consecutive polling failures for ${token.address}`);
          }
        });

        // Also refresh chart data without WS — merge trades so pending ones show
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
      }
    }, PRICE_UPDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      setLoading(token.address, false);
      unsubPrice();
      unsubTrades();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token?.address, timeframe, setLoading, setCandles, updateTokenPrice,
      setLivePrice, setActiveTimeframe, addWsTrade, confirmWsTrade, dropWsTrade, appendCandle, updateLastCandle]);
}

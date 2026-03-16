import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore, isTxCharted, markTxCharted } from '@/stores/price-store';
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

function isNewTradeData(d: unknown): d is TradeWsData {
  return d !== null && typeof d === 'object' && 'txHash' in d && 'type' in d;
}

function hasTxHash(d: unknown): d is { txHash: string; reason?: string } {
  return d !== null && typeof d === 'object' && 'txHash' in d;
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
  const lastSpotPriceRef = useRef<number | null>(null);

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

    function applySpotPriceToLastCandle(address: string) {
      const spotPrice = lastSpotPriceRef.current;
      if (spotPrice == null || spotPrice <= 0) return;
      const candles = usePriceStore.getState().candles[address] ?? [];
      const last = candles[candles.length - 1];
      if (!last || last.close === spotPrice) return;
      updateLastCandle(address, {
        ...last,
        high: Math.max(last.high, spotPrice),
        low: Math.min(last.low, spotPrice),
        close: spotPrice,
      });
    }

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
      if (priceResp) {
        if (lastSpotPriceRef.current == null) {
          lastSpotPriceRef.current = Number(priceResp.currentPriceSats);
        }
        updateTokenPrice(token.address, Number(priceResp.currentPriceSats), priceResp.change24hBps / 100);
      }
      applySpotPriceToLastCandle(token.address);
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
        const newPrice = Number(d.currentPriceSats);
        lastSpotPriceRef.current = newPrice;
        // Recalculate 24h change from reference price — WS events don't carry it
        const existing = useTokenStore.getState().selectedToken;
        const oldPrice = existing?.address === token.address ? existing.currentPriceSats : 0;
        const oldChange = existing?.address === token.address ? existing.priceChange24h : 0;
        const newChange = computeOptimistic24hChange(oldPrice, oldChange, newPrice);
        updateTokenPrice(token.address, newPrice, newChange);

        // Sync chart's last candle close to the spot price so chart and header match
        applySpotPriceToLastCandle(token.address);
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
      if (event === 'new_trade') {
        if (!isNewTradeData(data)) return;
        addWsTrade(token.address, data);

        if (isTxCharted(token.address, data.txHash)) return;
        markTxCharted(token.address, data.txHash);

        const tf = timeframeRef.current;
        const bucketSeconds = TIMEFRAME_SECONDS[tf];
        const nowSec = Math.floor(Date.now() / 1000);
        const bucketTime = Math.floor(nowSec / bucketSeconds) * bucketSeconds;
        const execPrice = Number(data.pricePerToken);
        const volume = Number(data.btcAmount);

        // pricePerToken from the backend is the post-trade spot price
        // (scaledToDisplayPrice of the contract's newPrice). Use it directly
        // as the close — the price_update WS hasn't arrived yet at this point,
        // so reading storeSpot here would give the stale pre-trade price and
        // move the chart in the wrong direction.
        const closePrice = execPrice;
        lastSpotPriceRef.current = execPrice;

        const candles = usePriceStore.getState().candles[token.address] ?? [];
        const last = candles[candles.length - 1];

        if (last && last.time === bucketTime) {
          updateLastCandle(token.address, {
            time: bucketTime,
            open: last.open,
            high: Math.max(last.high, execPrice),
            low: Math.min(last.low, execPrice),
            close: closePrice,
            volume: last.volume + volume,
          });
        } else {
          appendCandle(token.address, {
            time: bucketTime,
            open: execPrice,
            high: execPrice,
            low: Math.min(execPrice, closePrice),
            close: closePrice,
            volume,
          });
        }
      } else if (event === 'trade_confirmed') {
        if (!hasTxHash(data)) return;
        confirmWsTrade(token.address, data.txHash);
      } else if (event === 'trade_dropped') {
        if (!hasTxHash(data)) return;
        dropWsTrade(token.address, data.txHash);
      }
    });

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
          lastSpotPriceRef.current = Number(priceResp.currentPriceSats);
          setLivePrice(addr, {
            currentPriceSats: priceResp.currentPriceSats,
            virtualBtcReserve: priceResp.virtualBtcReserve,
            virtualTokenSupply: priceResp.virtualTokenSupply,
            realBtcReserve: priceResp.realBtcReserve,
            isOptimistic: priceResp.isOptimistic,
          });
          updateTokenPrice(addr, Number(priceResp.currentPriceSats), priceResp.change24hBps / 100);
        }
        applySpotPriceToLastCandle(addr);
      }).catch(() => {});
    }

    const handleTradeEvent = () => refreshFromServer();
    window.addEventListener('opump:trade', handleTradeEvent);

    let consecutiveFailures = 0;

    intervalRef.current = window.setInterval(() => {
      if (!wsClient.isConnected()) {
        api.getTokenPrice(token.address).then((price) => {
          consecutiveFailures = 0;
          lastSpotPriceRef.current = Number(price.currentPriceSats);
          setLivePrice(token.address, {
            currentPriceSats: price.currentPriceSats,
            virtualBtcReserve: price.virtualBtcReserve,
            virtualTokenSupply: price.virtualTokenSupply,
            realBtcReserve: price.realBtcReserve,
            isOptimistic: price.isOptimistic,
          });
          updateTokenPrice(token.address, Number(price.currentPriceSats), price.change24hBps / 100);
          applySpotPriceToLastCandle(token.address);
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
            applySpotPriceToLastCandle(token.address);
          }
        }).catch(() => { /* best-effort */ });
      }
    }, PRICE_UPDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      lastSpotPriceRef.current = null;
      setLoading(token.address, false);
      unsubPrice();
      unsubTrades();
      window.removeEventListener('opump:trade', handleTradeEvent);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token?.address, timeframe, setLoading, setCandles, updateTokenPrice,
      setLivePrice, setActiveTimeframe, addWsTrade, confirmWsTrade, dropWsTrade, appendCandle, updateLastCandle]);
}

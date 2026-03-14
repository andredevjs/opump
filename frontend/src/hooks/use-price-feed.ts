import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { useTradeStore } from '@/stores/trade-store';
import { PRICE_UPDATE_INTERVAL_MS } from '@/config/constants';
import type { TimeframeKey } from '@/types/api';
import { wsClient } from '@/services/websocket';
import * as api from '@/services/api';

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
    api.getOHLCV(token.address, timeframe).then((resp) => {
      if (!cancelled) {
        // Only replace candles if the API returned data; keep optimistic candles otherwise
        if (resp.candles.length > 0) {
          setCandles(token.address, resp.candles);
        }
        setLoading(token.address, false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLoading(token.address, false);
      }
    });

    wsClient.connect();

    const unsubPrice = wsClient.subscribe('token:price', token.address, (_event, data) => {
      if (!isPriceData(data)) return;
      const d = data;

      // Merge with existing — don't overwrite reserves with undefined
      setLivePrice(token.address, d);
      if (d.currentPriceSats != null) {
        updateTokenPrice(token.address, Number(d.currentPriceSats), 0);
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
          updateTokenPrice(token.address, Number(price.currentPriceSats), 0);
        }).catch(() => {
          consecutiveFailures++;
          if (consecutiveFailures >= 3) {
            console.warn(`[usePriceFeed] ${consecutiveFailures} consecutive polling failures for ${token.address}`);
          }
        });

        // Also refresh OHLCV so the chart stays current without WS
        // Only update if API returns data — don't overwrite optimistic candles with empty
        api.getOHLCV(token.address, timeframeRef.current).then((resp) => {
          if (!cancelled && resp.candles.length > 0) {
            setCandles(token.address, resp.candles);
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

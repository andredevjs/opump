import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { useTradeStore } from '@/stores/trade-store';
import { PRICE_UPDATE_INTERVAL_MS } from '@/config/constants';
import type { TimeframeKey } from '@/types/api';
import { wsClient } from '@/services/websocket';
import * as api from '@/services/api';

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
  const clearCandles = usePriceStore((s) => s.clearCandles);
  const setLoading = usePriceStore((s) => s.setLoading);
  const appendCandle = usePriceStore((s) => s.appendCandle);
  const updateLastCandle = usePriceStore((s) => s.updateLastCandle);
  const setLivePrice = usePriceStore((s) => s.setLivePrice);
  const addWsTrade = useTradeStore((s) => s.addWsTrade);
  const confirmWsTrade = useTradeStore((s) => s.confirmWsTrade);
  const dropWsTrade = useTradeStore((s) => s.dropWsTrade);
  const intervalRef = useRef<number>();
  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  useEffect(() => {
    if (!token) return;

    // Clear stale candles immediately and show loading
    clearCandles(token.address);
    setLoading(token.address, true);

    let cancelled = false;
    api.getOHLCV(token.address, timeframe).then((resp) => {
      if (!cancelled) {
        setCandles(token.address, resp.candles);
        setLoading(token.address, false);
      }
    }).catch(() => {
      if (!cancelled) {
        setCandles(token.address, []);
        setLoading(token.address, false);
      }
    });

    wsClient.connect();

    const unsubPrice = wsClient.subscribe('token:price', token.address, (_event, data) => {
      const d = data as Partial<{
        currentPriceSats: string;
        virtualBtcReserve: string;
        virtualTokenSupply: string;
        realBtcReserve: string;
        isOptimistic: boolean;
      }>;

      // Merge with existing — don't overwrite reserves with undefined
      setLivePrice(token.address, d);
      if (d.currentPriceSats != null) {
        updateTokenPrice(token.address, Number(d.currentPriceSats), 0);
      }
    });

    const unsubTrades = wsClient.subscribe('token:trades', token.address, (event, data) => {
      const d = data as {
        txHash: string;
        type: 'buy' | 'sell';
        traderAddress: string;
        btcAmount: string;
        tokenAmount: string;
        status: string;
        pricePerToken: string;
        reason?: string;
      };

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

    // Fallback polling in case WebSocket disconnects
    intervalRef.current = window.setInterval(() => {
      if (!wsClient.isConnected()) {
        api.getTokenPrice(token.address).then((price) => {
          setLivePrice(token.address, {
            currentPriceSats: price.currentPriceSats,
            virtualBtcReserve: price.virtualBtcReserve,
            virtualTokenSupply: price.virtualTokenSupply,
            realBtcReserve: price.realBtcReserve,
            isOptimistic: price.isOptimistic,
          });
          updateTokenPrice(token.address, Number(price.currentPriceSats), 0);
        }).catch(() => {
          // Silently ignore polling errors
        });
      }
    }, PRICE_UPDATE_INTERVAL_MS);

    return () => {
      cancelled = true;
      setLoading(token.address, false);
      unsubPrice();
      unsubTrades();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token?.address, timeframe]);
}

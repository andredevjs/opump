import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { useTradeStore } from '@/stores/trade-store';
import { PRICE_UPDATE_INTERVAL_MS } from '@/config/constants';
import type { TimeframeKey } from '@/types/api';
import { wsClient } from '@/services/websocket';
import * as api from '@/services/api';

export function usePriceFeed(token: Token | null, timeframe: TimeframeKey = '15m') {
  const updateTokenPrice = useTokenStore((s) => s.updateTokenPrice);
  const setCandles = usePriceStore((s) => s.setCandles);
  const setLivePrice = usePriceStore((s) => s.setLivePrice);
  const addWsTrade = useTradeStore((s) => s.addWsTrade);
  const confirmWsTrade = useTradeStore((s) => s.confirmWsTrade);
  const dropWsTrade = useTradeStore((s) => s.dropWsTrade);
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (!token) return;

    // Fetch OHLCV candles from API, then connect WebSocket
    let cancelled = false;
    api.getOHLCV(token.address, timeframe).then((resp) => {
      if (!cancelled) setCandles(token.address, resp.candles);
    }).catch(() => {
      if (!cancelled) setCandles(token.address, []);
    });

    wsClient.connect();

    const unsubPrice = wsClient.subscribe('token:price', token.address, (_event, data) => {
      const d = data as {
        currentPriceSats: string;
        virtualBtcReserve: string;
        virtualTokenSupply: string;
        realBtcReserve: string;
        isOptimistic: boolean;
      };

      setLivePrice(token.address, d);
      updateTokenPrice(token.address, Number(d.currentPriceSats), 0);
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
      unsubPrice();
      unsubTrades();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token?.address, timeframe]);
}

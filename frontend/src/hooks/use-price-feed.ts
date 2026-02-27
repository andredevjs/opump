import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { PRICE_UPDATE_INTERVAL_MS } from '@/config/constants';
import { generateOHLCV, type TimeframeKey } from '@/mock/ohlcv';

export function usePriceFeed(token: Token | null, timeframe: TimeframeKey = '15m') {
  const updateTokenPrice = useTokenStore((s) => s.updateTokenPrice);
  const { setCandles, updateLastCandle } = usePriceStore();
  const intervalRef = useRef<number>();

  useEffect(() => {
    if (!token) return;

    // Initialize candles
    const initialCandles = generateOHLCV(token, timeframe);
    setCandles(token.address, initialCandles);

    // Simulate real-time price updates
    intervalRef.current = window.setInterval(() => {
      const variation = (Math.random() - 0.48) * 0.03; // slight upward bias
      const personalityMultiplier =
        token.personality === 'pumping' ? 1.5 :
        token.personality === 'dumping' ? -1 :
        token.personality === 'volatile' ? 2 :
        1;

      const priceChange = variation * personalityMultiplier;
      const newPrice = token.currentPriceSats * (1 + priceChange);
      const newChange = token.priceChange24h + priceChange * 100;

      updateTokenPrice(token.address, newPrice, newChange);

      // Update last candle
      const now = Math.floor(Date.now() / 1000);
      const candles = usePriceStore.getState().candles[token.address];
      if (candles && candles.length > 0) {
        const lastCandle = { ...candles[candles.length - 1] };
        lastCandle.close = newPrice;
        lastCandle.high = Math.max(lastCandle.high, newPrice);
        lastCandle.low = Math.min(lastCandle.low, newPrice);
        lastCandle.time = now;
        updateLastCandle(token.address, lastCandle);
      }
    }, PRICE_UPDATE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token?.address, timeframe]);
}

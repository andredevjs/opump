import { useEffect, useRef } from 'react';
import type { Token } from '@/types/token';
import { useTokenStore } from '@/stores/token-store';
import { usePriceStore } from '@/stores/price-store';
import { useUIStore } from '@/stores/ui-store';
import { PRICE_UPDATE_INTERVAL_MS, INITIAL_VIRTUAL_TOKEN_SUPPLY, GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import type { TimeframeKey } from '@/types/api';
import * as api from '@/services/api';
import { computeOptimistic24hChange } from '@/lib/price-utils';

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
        api.getTokenPrice(addr).catch(() => null),
      ]).then(([ohlcvResp, priceResp]) => {
        if (cancelled) return;
        if (ohlcvResp.candles.length > 0) {
          setCandles(addr, ohlcvResp.candles);
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

      api.getOHLCV(token.address, timeframeRef.current).then((ohlcvResp) => {
        if (cancelled) return;
        if (ohlcvResp.candles.length > 0) {
          setCandles(token.address, ohlcvResp.candles);
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

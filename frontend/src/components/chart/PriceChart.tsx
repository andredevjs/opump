import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp, ColorType, CrosshairMode } from 'lightweight-charts';
import type { OHLCVCandle } from '@/types/api';
import { cn } from '@/lib/cn';
import { CHART_THEME } from '@/config/constants';

/** Minimum number of candle slots visible so candles never look oversized */
const MIN_VISIBLE_BARS = 160;

interface PriceChartProps {
  candles: OHLCVCandle[];
  loading?: boolean;
  className?: string;
}

export function PriceChart({ candles, loading, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: CHART_THEME.background },
        textColor: CHART_THEME.textColor,
        fontFamily: CHART_THEME.fontFamily,
        fontSize: CHART_THEME.fontSize,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: CHART_THEME.gridColor, style: 4 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_THEME.crosshairColor, width: 1, style: 3, labelBackgroundColor: '#1a1a2e' },
        horzLine: { color: CHART_THEME.crosshairColor, width: 1, style: 3, labelBackgroundColor: '#1a1a2e' },
      },
      rightPriceScale: {
        borderColor: CHART_THEME.borderColor,
        scaleMargins: { top: 0.05, bottom: 0.2 },
        borderVisible: false,
      },
      timeScale: {
        borderColor: CHART_THEME.borderColor,
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
        rightOffset: 5,
        barSpacing: 6,
        minBarSpacing: 2,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: CHART_THEME.upColor,
      downColor: CHART_THEME.downColor,
      borderUpColor: CHART_THEME.upColor,
      borderDownColor: CHART_THEME.downColor,
      wickUpColor: CHART_THEME.upColor,
      wickDownColor: CHART_THEME.downColor,
      borderVisible: false,
    });

    const volumeSeries = chart.addHistogramSeries({
      color: CHART_THEME.volumeColor,
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (candles.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }

    const candleData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? `${CHART_THEME.upColor}40` : `${CHART_THEME.downColor}40`,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    if (chartRef.current && candles.length > 0) {
      const ts = chartRef.current.timeScale();
      if (candles.length < MIN_VISIBLE_BARS) {
        // Few candles: show a wider time window so candles stay slim
        const last = candles[candles.length - 1].time;
        const interval = candles.length > 1 ? candles[1].time - candles[0].time : 60;
        const from = (last - interval * MIN_VISIBLE_BARS) as UTCTimestamp;
        ts.setVisibleRange({ from, to: (last + interval * 5) as UTCTimestamp });
      } else {
        ts.fitContent();
      }
    }
  }, [candles]);

  return (
    <div className={cn('relative w-full h-[500px]', className)}>
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/60 backdrop-blur-sm z-10">
          <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!loading && candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <p className="text-sm text-text-muted">No trades yet</p>
        </div>
      )}
    </div>
  );
}

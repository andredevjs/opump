import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp, ColorType, CrosshairMode, LineType } from 'lightweight-charts';
import type { OHLCVCandle, TimeframeKey } from '@/types/api';
import type { ChartType } from '@/stores/price-store';
import { cn } from '@/lib/cn';
import { CHART_THEME } from '@/config/constants';

interface PriceChartProps {
  candles: OHLCVCandle[];
  sourceCandles?: OHLCVCandle[];
  loading?: boolean;
  className?: string;
  priceFormatter?: (value: number) => string;
  chartType?: ChartType;
  tokenAddress?: string;
  timeframe?: TimeframeKey;
}

const defaultFormatter = (price: number) => {
  if (price === 0) return '0';
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(0);
  if (abs >= 1) return price.toFixed(2);
  if (abs >= 0.01) return price.toFixed(4);
  if (abs >= 0.0001) return price.toFixed(6);
  return price.toFixed(8);
};

type PriceSeries = ISeriesApi<'Line'> | ISeriesApi<'Candlestick'>;

export function PriceChart({
  candles,
  sourceCandles = candles,
  loading,
  className,
  priceFormatter,
  chartType = 'line',
  tokenAddress,
  timeframe,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<PriceSeries | null>(null);

  const chartTypeRef = useRef<ChartType>(chartType);
  // Auto-fit state: tracks when the chart should call fitContent().
  // 'immediate'        — fit now (initial render, chart-type switch)
  // 'on-source-change' — fit once sourceCandles reference changes (token/timeframe switch)
  // false              — viewport is user-controlled, don't fit
  const needsFitRef = useRef<'immediate' | 'on-source-change' | false>('immediate');
  const prevContextRef = useRef<{
    tokenAddress?: string;
    timeframe?: TimeframeKey;
    chartType: ChartType;
  } | null>(null);
  const lastRenderedSourceCandlesRef = useRef<OHLCVCandle[] | null>(null);
  const [hoveredOhlcv, setHoveredOhlcv] = useState<OHLCVCandle | null>(null);

  const formatter = priceFormatter ?? defaultFormatter;

  useEffect(() => {
    chartTypeRef.current = chartType;
  }, [chartType]);

  // Create chart instance + volume series (mount only)
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

    chartRef.current = chart;

    // Crosshair subscription for OHLCV tooltip in candlestick mode
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || chartTypeRef.current !== 'candlestick') {
        setHoveredOhlcv(null);
        return;
      }
      const series = priceSeriesRef.current;
      if (!series) { setHoveredOhlcv(null); return; }

      const data = param.seriesData.get(series) as
        | { open: number; high: number; low: number; close: number; time: number }
        | undefined;

      if (data && 'open' in data) {
        setHoveredOhlcv({
          time: data.time,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 0,
        });
      } else {
        setHoveredOhlcv(null);
      }
    });

    return () => {
      chartRef.current = null;
      priceSeriesRef.current = null;
      chart.remove();
    };
  }, []);

  // Create/swap price series when chartType changes (also runs on mount)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const autoscaleProvider = (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
      const res = original();
      if (res !== null) {
        const range = res.priceRange.maxValue - res.priceRange.minValue;
        const mid = (res.priceRange.maxValue + res.priceRange.minValue) / 2;
        if (range < mid * 0.001) {
          const margin = mid * 0.05 || (priceFormatter ? 1 : 0.00000001);
          res.priceRange.minValue -= margin;
          res.priceRange.maxValue += margin;
        }
        // Prices and market caps can never be negative
        if (res.priceRange.minValue < 0) {
          res.priceRange.minValue = 0;
        }
      }
      return res;
    };

    const priceFormat = {
      type: 'custom' as const,
      formatter,
      minMove: priceFormatter ? 0.01 : 0.00000001,
    };

    // Remove existing price series
    if (priceSeriesRef.current) {
      chart.removeSeries(priceSeriesRef.current);
      priceSeriesRef.current = null;
    }

    if (chartType === 'candlestick') {
      priceSeriesRef.current = chart.addCandlestickSeries({
        upColor: CHART_THEME.upColor,
        downColor: CHART_THEME.downColor,
        borderVisible: false,
        wickUpColor: CHART_THEME.upColor,
        wickDownColor: CHART_THEME.downColor,
        priceFormat,
        autoscaleInfoProvider: autoscaleProvider,
      });
    } else {
      priceSeriesRef.current = chart.addLineSeries({
        color: CHART_THEME.lineColor,
        lineWidth: 2,
        lineType: LineType.Curved,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBackgroundColor: CHART_THEME.lineColor,
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat,
        autoscaleInfoProvider: autoscaleProvider,
      });
    }
  }, [chartType, formatter, priceFormatter]);

  // Set data + auto-fit decision (consolidated to avoid implicit coupling across effects)
  useEffect(() => {
    const priceSeries = priceSeriesRef.current;
    if (!priceSeries) return;

    // Detect context changes and decide fit strategy
    const prev = prevContextRef.current;
    if (prev) {
      const dataContextChanged = prev.tokenAddress !== tokenAddress || prev.timeframe !== timeframe;
      const presentationChanged = prev.chartType !== chartType;

      if (presentationChanged) {
        needsFitRef.current = 'immediate';
      } else if (dataContextChanged && !needsFitRef.current) {
        needsFitRef.current = sourceCandles !== lastRenderedSourceCandlesRef.current
          ? 'immediate'
          : 'on-source-change';
      }
    }
    prevContextRef.current = { tokenAddress, timeframe, chartType };

    if (candles.length === 0) {
      priceSeries.setData([]);
      if (!needsFitRef.current) needsFitRef.current = 'immediate';
      lastRenderedSourceCandlesRef.current = sourceCandles;
      return;
    }

    if (chartType === 'candlestick') {
      const ohlcData = candles.map((c, i) => {
        // Use previous candle's close as this candle's open so that
        // single-trade candles still render a visible body instead of
        // collapsing to a flat doji line.
        const open = i > 0 ? candles[i - 1].close : c.open;
        return {
          time: c.time as UTCTimestamp,
          open,
          high: Math.max(c.high, open),
          low: Math.min(c.low, open),
          close: c.close,
        };
      });
      (priceSeries as ISeriesApi<'Candlestick'>).setData(ohlcData);
    } else {
      const lineData = candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.close,
      }));
      (priceSeries as ISeriesApi<'Line'>).setData(lineData);
    }

    const chart = chartRef.current;
    const fitMode = needsFitRef.current;
    if (chart && fitMode) {
      if (fitMode === 'immediate' || sourceCandles !== lastRenderedSourceCandlesRef.current) {
        chart.timeScale().fitContent();
        needsFitRef.current = false;
      }
    }

    lastRenderedSourceCandlesRef.current = sourceCandles;
  }, [candles, chartType, sourceCandles, tokenAddress, timeframe]);

  return (
    <div className={cn('relative w-full h-[500px]', className)}>
      <div ref={containerRef} className="w-full h-full" />
      {hoveredOhlcv && chartType === 'candlestick' && (
        <div className="absolute top-2 left-2 z-20 bg-surface/80 backdrop-blur-sm rounded px-2 py-1 font-mono text-[10px] text-text-secondary flex gap-3 pointer-events-none">
          <span>O: {formatter(hoveredOhlcv.open)}</span>
          <span>H: {formatter(hoveredOhlcv.high)}</span>
          <span>L: {formatter(hoveredOhlcv.low)}</span>
          <span>C: {formatter(hoveredOhlcv.close)}</span>
        </div>
      )}
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

import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type UTCTimestamp, ColorType, CrosshairMode, LineType } from 'lightweight-charts';
import type { OHLCVCandle } from '@/types/api';
import { cn } from '@/lib/cn';
import { CHART_THEME } from '@/config/constants';

interface PriceChartProps {
  candles: OHLCVCandle[];
  loading?: boolean;
  className?: string;
}

export function PriceChart({ candles, loading, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
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

    const lineSeries = chart.addLineSeries({
      color: CHART_THEME.lineColor,
      lineWidth: 2,
      lineType: LineType.Curved,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: CHART_THEME.lineColor,
      lastValueVisible: true,
      priceLineVisible: false,
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
    lineSeriesRef.current = lineSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chartRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!lineSeriesRef.current || !volumeSeriesRef.current) return;

    if (candles.length === 0) {
      lineSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }

    const lineData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.close,
    }));

    const volumeData = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? `${CHART_THEME.upColor}40` : `${CHART_THEME.downColor}40`,
    }));

    lineSeriesRef.current.setData(lineData);
    volumeSeriesRef.current.setData(volumeData);

    if (chartRef.current && candles.length > 0) {
      chartRef.current.timeScale().fitContent();
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

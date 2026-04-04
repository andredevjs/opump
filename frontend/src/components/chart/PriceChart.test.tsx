import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PriceChart } from './PriceChart';

const reactTestEnv = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactTestEnv.IS_REACT_ACT_ENVIRONMENT = true;

const fitContent = vi.fn();
const candlestickSetData = vi.fn();
const lineSetData = vi.fn();
const removeSeries = vi.fn();
const subscribeCrosshairMove = vi.fn();
const remove = vi.fn();

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addCandlestickSeries: vi.fn(() => ({
      setData: candlestickSetData,
    })),
    addLineSeries: vi.fn(() => ({
      setData: lineSetData,
    })),
    removeSeries,
    subscribeCrosshairMove,
    remove,
    timeScale: () => ({
      fitContent,
    }),
  })),
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0 },
  LineType: { Curved: 0 },
}));

const candles = [
  { time: 1, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 2, open: 11, high: 13, low: 10, close: 12, volume: 120 },
];

const sourceCandles = [
  { time: 1, open: 1, high: 1.2, low: 0.9, close: 1.1, volume: 100 },
  { time: 2, open: 1.1, high: 1.3, low: 1.0, close: 1.2, volume: 120 },
];

describe('PriceChart', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fitContent.mockClear();
    candlestickSetData.mockClear();
    lineSetData.mockClear();
    removeSeries.mockClear();
    subscribeCrosshairMove.mockClear();
    remove.mockClear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('preserves the current viewport across candle refreshes', () => {
    act(() => {
      root.render(
        <PriceChart
          candles={candles}
          sourceCandles={sourceCandles}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="1m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(1);
    expect(candlestickSetData).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <PriceChart
          candles={[
            candles[0],
            { ...candles[1], high: 14, close: 13 },
          ]}
          sourceCandles={sourceCandles}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="1m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(1);
    expect(candlestickSetData).toHaveBeenCalledTimes(2);
  });

  it('waits for replacement candles before auto-fitting a timeframe change', () => {
    act(() => {
      root.render(
        <PriceChart
          candles={candles}
          sourceCandles={sourceCandles}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="1m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <PriceChart
          candles={[
            { ...candles[0], open: 100, high: 120, low: 90, close: 110 },
            { ...candles[1], open: 110, high: 130, low: 100, close: 120 },
          ]}
          sourceCandles={sourceCandles}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="5m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <PriceChart
          candles={[
            { ...candles[0], open: 20, high: 24, low: 19, close: 23 },
            { ...candles[1], open: 23, high: 28, low: 21, close: 27 },
          ]}
          sourceCandles={[
            { ...sourceCandles[0], open: 2, high: 2.4, low: 1.9, close: 2.3 },
            { ...sourceCandles[1], open: 2.3, high: 2.8, low: 2.1, close: 2.7 },
          ]}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="5m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(2);
  });

  it('does not treat a stale MCAP remap as replacement timeframe data', () => {
    act(() => {
      root.render(
        <PriceChart
          candles={candles}
          sourceCandles={sourceCandles}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="1m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <PriceChart
          candles={[
            { ...candles[0], open: 200, high: 240, low: 180, close: 220 },
            { ...candles[1], open: 220, high: 260, low: 200, close: 240 },
          ]}
          sourceCandles={sourceCandles}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="5m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <PriceChart
          candles={[
            { ...candles[0], open: 20, high: 24, low: 19, close: 23 },
            { ...candles[1], open: 23, high: 28, low: 21, close: 27 },
          ]}
          sourceCandles={[
            { ...sourceCandles[0], open: 2, high: 2.4, low: 1.9, close: 2.3 },
            { ...sourceCandles[1], open: 2.3, high: 2.8, low: 2.1, close: 2.7 },
          ]}
          chartType="candlestick"
          tokenAddress="token-1"
          timeframe="5m"
        />,
      );
    });

    expect(fitContent).toHaveBeenCalledTimes(2);
  });
});

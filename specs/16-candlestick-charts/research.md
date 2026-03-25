# Research: Candlestick Charts

**Date**: 2026-03-25

## Clarification Resolutions

No NEEDS CLARIFICATION items in spec — all assumptions validated.

## Technology Findings

### lightweight-charts v4.2.3 — Candlestick Support

The existing charting library (`lightweight-charts` v4.2.3) natively supports candlestick series via `chart.addCandlestickSeries()`.

**Candlestick data format** (identical to existing OHLCV data):
```ts
{ time: UTCTimestamp, open: number, high: number, low: number, close: number }
```

This maps 1:1 from the existing `OHLCVCandle` type. No data transformation needed.

**Key API methods**:
- `chart.addCandlestickSeries(options)` — creates candlestick series
- `chart.removeSeries(series)` — removes a series without destroying the chart
- Candlestick options: `upColor`, `downColor`, `borderUpColor`, `borderDownColor`, `wickUpColor`, `wickDownColor`

**Series swapping**: lightweight-charts supports removing one series and adding another on the same chart instance. This preserves the time scale, scroll position, and zoom level — ideal for toggling between line and candlestick without chart recreation.

### Design Decision: Series Swap vs Chart Recreation

| Approach | Pros | Cons |
|----------|------|------|
| Swap series on same chart | Preserves zoom/scroll, no flicker, ~0ms transition | Must manage series refs carefully |
| Recreate chart on toggle | Simpler code | Flicker, loses zoom/scroll, ~50-100ms delay |

**Decision**: Series swap. The user experience is significantly better — no flicker, instant toggle, preserved viewport state.

### Design Decision: Preference Storage

| Approach | Scope | Persistence |
|----------|-------|-------------|
| Zustand store only | Tab | Lost on refresh |
| sessionStorage + Zustand | Tab session | Survives refresh within same tab |
| localStorage | Cross-session | Survives browser restart |

**Decision**: sessionStorage + Zustand. Matches spec ("session" scope). Chart type preference is read from sessionStorage on mount and synced back on change.

### Existing Infrastructure

- **OHLCV data**: Already fetched and merged in `usePriceFeed` hook — no changes needed
- **CHART_THEME**: Already defines `upColor` (#22c55e) and `downColor` (#ef4444) — reuse for candlestick colors
- **Volume histogram**: Independent series on separate price scale — unaffected by line↔candlestick swap
- **Crosshair**: Already configured in Normal mode — works with both series types
- **mcapCandles**: TokenPage already transforms OHLCV to market cap values — candlestick will use same data
- **autoscaleInfoProvider**: Currently on line series; candlestick series has its own auto-scaling built in — the flat-candle case (single trade) is handled by lightweight-charts' default behavior

### No API Changes Required

The `/api/v1/tokens/:address/ohlcv` endpoint already returns full OHLCV candles. The frontend currently discards O/H/L and only uses `close` for the line chart. Candlestick will use all four OHLC fields. Zero backend work.

### Mempool-First Compliance

The existing polling + trade-merging architecture already satisfies FR-005 through FR-007. The candlestick chart is just a different rendering of the same data pipeline. No changes to data flow needed.

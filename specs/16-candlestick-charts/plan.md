# Implementation Plan: Candlestick Chart Option & Real-Time Trade Reflection

**Branch**: `16-candlestick-charts` | **Date**: 2026-03-25 | **Spec**: specs/16-candlestick-charts/spec.md

## Summary

Add a candlestick/line toggle to the token chart, rendering OHLC candles via lightweight-charts' native candlestick series. The same data pipeline (OHLCV + trade merge) feeds both views. Session preference persists via sessionStorage. All real-time behavior (mempool-first updates, volume, holders, mcap, bonding curve) is already in place and requires no changes.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)
**Primary Dependencies**: React 18, lightweight-charts 4.2.3, Zustand 4, TailwindCSS
**Storage**: sessionStorage (chart type preference)
**Testing**: Manual verification (existing project has no frontend test framework)
**Target Platform**: Web (SPA, Vite)
**Project Type**: Web application (frontend-only changes)
**Performance Goals**: < 200ms chart type toggle, no flicker
**Constraints**: No API changes, no new dependencies, mempool-first architecture preserved

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | No contract changes |
| Frontend never holds keys | PASS | No signing changes |
| Shared type definitions | PASS | Uses existing `OHLCVCandle` type |
| Mempool-first UI updates | PASS | Same data pipeline, different rendering |

No violations.

## Architecture Overview

```
ChartControls.tsx  ← add chart type toggle buttons
       │
       ▼ chartType prop
PriceChart.tsx     ← swap between LineSeries and CandlestickSeries
       │                on the same chart instance (no recreation)
       │
       ▼ reads from
price-store.ts     ← add chartType field + sessionStorage sync
       │
       ▼ data from (unchanged)
use-price-feed.ts  ← no changes needed
```

**Files to modify** (4 files):
1. `frontend/src/stores/price-store.ts` — add `chartType` state + persistence
2. `frontend/src/components/chart/ChartControls.tsx` — add line/candlestick toggle
3. `frontend/src/components/chart/PriceChart.tsx` — support candlestick series
4. `frontend/src/pages/TokenPage.tsx` — wire chartType prop through

**Files unchanged**: `use-price-feed.ts`, `constants.ts`, all API/netlify functions, all other components.

---

## Phase 1: Chart Type State & Persistence

**Goal**: Add chart type to Zustand store with sessionStorage persistence.

### Task 1.1 — Add chartType to price-store

**File**: `frontend/src/stores/price-store.ts`

Add to the store:
```ts
type ChartType = 'line' | 'candlestick';

// In PriceStore interface:
chartType: ChartType;
setChartType: (type: ChartType) => void;

// Initial value from sessionStorage:
const CHART_TYPE_KEY = 'opump-chart-type';
const storedType = (typeof window !== 'undefined'
  ? sessionStorage.getItem(CHART_TYPE_KEY)
  : null) as ChartType | null;

// In create():
chartType: storedType === 'candlestick' ? 'candlestick' : 'line',
setChartType: (type) => {
  sessionStorage.setItem(CHART_TYPE_KEY, type);
  set({ chartType: type });
},
```

**Why sessionStorage over localStorage**: Spec says "session" scope. sessionStorage is per-tab, cleared on tab close.

**Acceptance**: `usePriceStore.getState().chartType` returns `'line'` by default. After `setChartType('candlestick')`, refreshing the page preserves the value within the same tab.

### Task 1.2 — Export ChartType type

**File**: `frontend/src/stores/price-store.ts`

Export the `ChartType` type so it can be imported by `ChartControls` and `PriceChart`.

---

## Phase 2: Chart Controls Toggle

**Goal**: Add line/candlestick toggle buttons to the chart header bar.

### Task 2.1 — Add chart type toggle to ChartControls

**File**: `frontend/src/components/chart/ChartControls.tsx`

Add two icon-based toggle buttons (or text: "Line" / "Candles") to the left of the timeframe buttons, visually separated by a divider.

```tsx
import type { ChartType } from '@/stores/price-store';

interface ChartControlsProps {
  timeframe: TimeframeKey;
  onTimeframeChange: (tf: TimeframeKey) => void;
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
}
```

**UI design**:
- Two small buttons: line icon (or "Line") and candlestick icon (or "Candles")
- Same styling as timeframe buttons (`bg-accent/10 text-accent` for active)
- Separated from timeframe buttons by a thin vertical divider (`border-r border-border`)
- Use lucide-react icons: `LineChart` for line, `CandlestickChart` for candlestick (check availability — if not available, use text labels "Line" / "OHLC")

**Acceptance**: Toggle buttons render, clicking switches active state, styling matches existing timeframe buttons.

### Task 2.2 — Wire toggle into TokenPage

**File**: `frontend/src/pages/TokenPage.tsx`

- Read `chartType` and `setChartType` from `usePriceStore`
- Pass to `ChartControls` as props
- Pass `chartType` to `PriceChart` as a new prop

```tsx
const chartType = usePriceStore((s) => s.chartType);
const setChartType = usePriceStore((s) => s.setChartType);

<ChartControls
  timeframe={timeframe}
  onTimeframeChange={setTimeframe}
  chartType={chartType}
  onChartTypeChange={setChartType}
/>
<PriceChart candles={mcapCandles} loading={chartLoading} chartType={chartType} priceFormatter={formatMcapUsd} />
```

**Acceptance**: Clicking toggle changes chart type. Preference survives page navigation and refresh.

---

## Phase 3: Candlestick Series Rendering

**Goal**: PriceChart renders either line or candlestick series based on prop.

### Task 3.1 — Add chartType prop and series management to PriceChart

**File**: `frontend/src/components/chart/PriceChart.tsx`

**Strategy**: Keep a single chart instance. When `chartType` changes, remove the old price series and add a new one. The volume histogram series is independent and never changes.

```tsx
import { ..., type CandlestickSeriesOptions } from 'lightweight-charts';
import type { ChartType } from '@/stores/price-store';

interface PriceChartProps {
  candles: OHLCVCandle[];
  loading?: boolean;
  className?: string;
  priceFormatter?: (value: number) => string;
  chartType?: ChartType;  // default: 'line'
}
```

**Implementation details**:

1. **Refs**: Change `lineSeriesRef` to a generic `priceSeriesRef` that can hold either series type. Add a `currentChartTypeRef` to track which is active.

2. **Chart creation effect** (first `useEffect`): Create the chart instance with no price series. Volume histogram series is created here as before.

3. **Series swap effect** (new `useEffect` on `[chartType]`):
   - If `priceSeriesRef.current` exists, call `chartRef.current.removeSeries(priceSeriesRef.current)`
   - If `chartType === 'candlestick'`: call `chart.addCandlestickSeries(options)`
   - If `chartType === 'line'`: call `chart.addLineSeries(options)` (existing config)
   - Store new series in `priceSeriesRef.current`
   - Re-set data from current candles

4. **Candlestick series options**:
   ```ts
   {
     upColor: CHART_THEME.upColor,        // #22c55e
     downColor: CHART_THEME.downColor,     // #ef4444
     borderUpColor: CHART_THEME.upColor,
     borderDownColor: CHART_THEME.downColor,
     wickUpColor: CHART_THEME.upColor,
     wickDownColor: CHART_THEME.downColor,
     priceFormat: {
       type: 'custom',
       formatter: priceFormatter ?? defaultFormatter,
       minMove: priceFormatter ? 0.01 : 0.00000001,
     },
   }
   ```

5. **Data update effect** (existing second `useEffect` on `[candles]`):
   - For line: set data as `{ time, value: close }` (existing behavior)
   - For candlestick: set data as `{ time, open, high, low, close }` (full OHLCV)
   - Volume histogram: unchanged

**Edge case — single-trade candle**: When O=H=L=C, lightweight-charts renders a thin horizontal line (doji) which is visible. No special handling needed.

**Edge case — no data**: Both series types handle empty arrays gracefully with `setData([])`.

**Acceptance**: Toggle between line and candlestick without flicker. Zoom/scroll position is preserved. Volume histogram remains visible in both modes.

### Task 3.2 — Preserve autoscale behavior for candlestick

The existing `autoscaleInfoProvider` on the line series handles flat price ranges. For candlestick, lightweight-charts has built-in autoscaling that works well with OHLC data. However, apply the same margin logic to candlestick series to ensure consistent behavior:

```ts
autoscaleInfoProvider: (original) => {
  const res = original();
  if (res !== null) {
    const range = res.priceRange.maxValue - res.priceRange.minValue;
    const mid = (res.priceRange.maxValue + res.priceRange.minValue) / 2;
    if (range < mid * 0.001) {
      const margin = mid * 0.05 || (priceFormatter ? 1 : 0.00000001);
      res.priceRange.minValue -= margin;
      res.priceRange.maxValue += margin;
    }
  }
  return res;
},
```

This prevents a flat candle (or series of flat candles) from occupying zero vertical space.

**Acceptance**: A token with only one trade renders a visible candle, not an invisible flat line.

---

## Phase 4: OHLCV Crosshair Tooltip

**Goal**: When hovering a candlestick, show O/H/L/C values.

### Task 4.1 — Subscribe to crosshair move for OHLCV display

**File**: `frontend/src/components/chart/PriceChart.tsx`

lightweight-charts' built-in crosshair already shows the price at the cursor position. For candlestick mode, the default behavior shows the close price in the price scale label.

**Enhancement**: Use `chart.subscribeCrosshairMove(handler)` to capture the OHLCV data for the hovered candle. Render a small overlay in the top-left of the chart area showing:

```
O: $1,234  H: $1,289  L: $1,210  C: $1,267  V: $45.2K
```

**Implementation**:
- Add a state variable `hoveredCandle: OHLCVCandle | null`
- In crosshair move handler, extract series data at the hovered time
- Render an absolutely-positioned overlay div when `hoveredCandle` is set and `chartType === 'candlestick'`
- Style: semi-transparent background, monospace font, positioned top-left inside chart container
- Clear on mouse leave

**Acceptance**: Hovering over a candle shows OHLCV values. Moving away clears the overlay. The overlay does not interfere with chart interaction.

---

## Phase 5: Polish & Edge Cases

### Task 5.1 — Prevent flash on page load with candlestick preference

**File**: `frontend/src/components/chart/PriceChart.tsx`

Read `chartType` on initial chart creation. If the user's preference is `'candlestick'`, create the candlestick series directly in the chart creation effect — never create a line series first.

**Implementation**: The series swap effect (Phase 3, Task 3.1) runs on mount with the initial `chartType` value, so the correct series is created first. Ensure no default line series is created in the chart creation effect.

**Acceptance**: With `sessionStorage` set to `'candlestick'`, page load renders candlestick directly. No line→candlestick flash.

### Task 5.2 — Gap handling for empty time buckets

Lightweight-charts handles gaps natively — if a time bucket has no data point, no candle is drawn and the chart shows a gap. This is the standard behavior for financial charts (markets aren't always active).

No code change needed. Document this as expected behavior.

### Task 5.3 — Mobile touch interaction

Lightweight-charts supports pinch-to-zoom and pan gestures by default. The existing chart config has `handleScroll: { vertTouchDrag: false }` which prevents accidental vertical scrolling while interacting with the chart.

Verify candlestick mode preserves these touch behaviors. The toggle buttons should be large enough for touch targets (existing buttons are already touch-friendly at `px-2.5 py-1`).

**Acceptance**: On mobile viewport, candlestick chart is scrollable/zoomable via touch. Toggle buttons are tappable.

---

## Implementation Order

```
Phase 1 (store)     → Phase 2 (controls)     → Phase 3 (rendering)  → Phase 4 (tooltip)  → Phase 5 (polish)
  Task 1.1            Task 2.1                  Task 3.1               Task 4.1              Task 5.1
  Task 1.2            Task 2.2                  Task 3.2                                     Task 5.2
                                                                                             Task 5.3
```

Phases 1→2→3 are sequential (each depends on the previous). Phase 4 and Phase 5 can run in parallel after Phase 3.

## Complexity Tracking

| Task | Estimated LOC Changed | Risk |
|------|----------------------|------|
| 1.1 | ~15 | Low — additive store change |
| 1.2 | ~2 | Trivial |
| 2.1 | ~25 | Low — UI only |
| 2.2 | ~8 | Low — prop threading |
| 3.1 | ~60 | Medium — series lifecycle management |
| 3.2 | ~5 | Low — copy existing logic |
| 4.1 | ~35 | Medium — crosshair event handling |
| 5.1 | ~0 | None — handled by 3.1 design |
| 5.2 | ~0 | None — native behavior |
| 5.3 | ~0 | None — verify only |

**Total**: ~150 LOC changed across 4 files. No new files. No new dependencies.

## What This Plan Does NOT Change

- **No API changes**: OHLCV endpoint already returns full candle data
- **No data flow changes**: `usePriceFeed`, trade merging, deduplication — all unchanged
- **No store structure changes**: Candles, trades, live prices — all unchanged
- **No polling interval changes**: 2.5s chart, 15s trades, 30s holders — all unchanged
- **No new dependencies**: lightweight-charts already has candlestick support
- **No contract changes**: Pure frontend feature

The spec's User Story 2 (trades appear immediately) is already fully implemented by the existing mempool-first architecture. This plan verifies it works with candlestick rendering (same data, different visualization) but requires no changes to achieve it.

# Tasks: Candlestick Chart Option & Real-Time Trade Reflection

**Branch**: `16-candlestick-charts` | **Generated**: 2026-03-25
**Spec**: specs/16-candlestick-charts/spec.md | **Plan**: specs/16-candlestick-charts/plan.md

---

## Phase 1: Setup — Chart Type State & Persistence

**Depends on**: nothing
**Goal**: Add `ChartType` to Zustand store with sessionStorage sync so the rest of the feature has state to work with.

- [x] T001 [US1] Add `ChartType` type (`'line' | 'candlestick'`), `chartType` state, and `setChartType` action to the price store with sessionStorage persistence — `frontend/src/stores/price-store.ts`

---

## Phase 2: Foundational — Chart Controls Toggle UI

**Depends on**: Phase 1
**Goal**: Users can see and click the chart type toggle. No rendering change yet.

- [x] T002 [US1] Add `chartType` and `onChartTypeChange` props to `ChartControls`, render line/candlestick toggle buttons with a divider separating them from the timeframe buttons, using same active/inactive styling — `frontend/src/components/chart/ChartControls.tsx`
- [x] T003 [US1] Wire `chartType` and `setChartType` from `usePriceStore` into `TokenPage`, pass to `ChartControls` and `PriceChart` as props — `frontend/src/pages/TokenPage.tsx`

---

## Phase 3: User Story 1 — Toggle Between Line and Candlestick Views (P1)

**Depends on**: Phase 2
**Goal**: Clicking the toggle switches the chart between line and candlestick rendering. Volume histogram stays. Zoom/scroll preserved.

- [x] T004 [US1] Refactor `PriceChart` to accept `chartType` prop: replace `lineSeriesRef` with a generic `priceSeriesRef`, create chart instance without a price series in the first `useEffect`, add a new `useEffect` on `[chartType]` that removes the old series and adds the correct one (line or candlestick), set data immediately after series creation — `frontend/src/components/chart/PriceChart.tsx`
- [x] T005 [US1] Configure candlestick series options using `CHART_THEME.upColor` / `downColor` for body, border, and wick colors, with the same custom `priceFormat` and `autoscaleInfoProvider` as the line series — `frontend/src/components/chart/PriceChart.tsx`
- [x] T006 [US1] Update the data-setting `useEffect` (on `[candles]`) to branch on `chartType`: line uses `{ time, value: close }`, candlestick uses `{ time, open, high, low, close }` — volume histogram unchanged — `frontend/src/components/chart/PriceChart.tsx`

---

## Phase 4: User Story 2 — Trades Appear on Chart Immediately (P1)

**Depends on**: Phase 3
**Goal**: Verify the existing mempool-first data pipeline works with candlestick rendering. No code changes expected — this phase is verification only.

- [x] T007 [US2] Verify that OHLCV polling + trade merge in `usePriceFeed` correctly updates candlestick candles in real time — confirm the same `setCandles` flow feeds both chart types with no gating on confirmations — `frontend/src/hooks/use-price-feed.ts` (read-only verification, no changes)

---

## Phase 5: User Story 3 — Candlestick Chart Readability and Interaction (P2)

**Depends on**: Phase 3
**Goal**: OHLCV tooltip overlay on hover, edge case handling, mobile verification.

- [x] T008 [US3] Add crosshair move subscription in `PriceChart` that captures OHLCV data for the hovered candle, render an absolutely-positioned overlay (top-left, semi-transparent bg, monospace) showing `O H L C V` values when `chartType === 'candlestick'`, clear on mouse leave — `frontend/src/components/chart/PriceChart.tsx`
- [x] T009 [US3] Ensure no line→candlestick flash on page load: the series creation `useEffect` must read the initial `chartType` value and create the correct series type on first mount — no default line series creation — `frontend/src/components/chart/PriceChart.tsx`
- [x] T010 [US3] Verify mobile touch interaction: candlestick chart supports pinch-to-zoom and pan, toggle buttons are tappable at existing `px-2.5 py-1` size — manual verification, no code changes expected

---

## Summary

| Phase | Tasks | Stories | Code Changes |
|-------|-------|---------|-------------|
| 1: Setup | T001 | US1 | `price-store.ts` |
| 2: Foundational | T002–T003 | US1 | `ChartControls.tsx`, `TokenPage.tsx` |
| 3: US1 Rendering | T004–T006 | US1 | `PriceChart.tsx` |
| 4: US2 Verify | T007 | US2 | none (verification) |
| 5: US3 Polish | T008–T010 | US3 | `PriceChart.tsx` |

**Total**: 10 tasks (7 code, 1 verification-only, 2 manual verification)
**Files modified**: 4 (`price-store.ts`, `ChartControls.tsx`, `PriceChart.tsx`, `TokenPage.tsx`)
**Parallel opportunities**: T002 + T003 can run in parallel (different files). T007, T008–T010 can all run in parallel after Phase 3.
**MVP scope**: Phases 1–3 (T001–T006) deliver a fully functional line/candlestick toggle. Phase 4–5 are polish.

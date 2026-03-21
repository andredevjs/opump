# Tasks: MCAP $ Display on Charts & Bonding Curve

**Branch**: `14-mcap-chart-display` | **Date**: 2026-03-21
**Spec**: specs/14-mcap-chart-display/spec.md | **Plan**: specs/14-mcap-chart-display/plan.md

---

## Phase 1: Foundational — Conversion Helpers

> **Goal**: Create the shared constant and utility functions that all user stories depend on.

- [x] T001 [P] Add `TOTAL_SUPPLY_WHOLE_TOKENS` constant to `frontend/src/config/constants.ts` (after line 15, GRADUATION_THRESHOLD_SATS). Value: `1_000_000_000` (1B tokens = INITIAL_VIRTUAL_TOKEN_SUPPLY / TOKEN_UNITS_PER_TOKEN).

- [x] T002 [P] Add `priceSatsToMcapUsd(pricePerToken: number, btcPrice: number): number` and `formatMcapUsd(value: number): string` to `frontend/src/lib/format.ts` (after `formatUsdPrice`, ~line 94). Import `TOTAL_SUPPLY_WHOLE_TOKENS` and `SATS_PER_BTC` from constants. Conversion formula: `pricePerToken * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice`. Format: `$0`, `$690`, `$1.2k`, `$69k`, `$1.2M`.

---

## Phase 2: User Story 1 — View Market Cap on Price Chart (P1)

> **Goal**: Chart Y-axis and crosshair display MCAP in USD instead of raw pricePerToken.
> **Depends on**: Phase 1 (T001, T002)

- [x] T003 [US1] Update `PriceChart` in `frontend/src/components/chart/PriceChart.tsx` to accept an optional `priceFormatter?: (value: number) => string` prop. Extract the current hardcoded formatter (lines 82-90) into a `defaultFormatter` const. Use `priceFormatter ?? defaultFormatter` in the `priceFormat.formatter` field. When `priceFormatter` is provided, set `minMove: 0.01` (instead of 10^-8) and update autoscale fallback margin (line 73) from `0.00000001` to `1`.

- [x] T004 [US1] In `frontend/src/pages/TokenPage.tsx`: (a) add `useMemo` to the React import; (b) import `priceSatsToMcapUsd` and `formatMcapUsd` from `@/lib/format`; (c) after `const { btcPrice } = useBtcPrice()` (line 39), create `mcapCandles` via `useMemo` that maps each candle's `open/high/low/close` through `priceSatsToMcapUsd(value, btcPrice)` — return raw candles when `btcPrice <= 0`; (d) pass `mcapCandles` and `priceFormatter={formatMcapUsd}` to `<PriceChart>` (line 118); (e) change the chart header label from "Price Chart" to "Market Cap" (line 115).

---

## Phase 3: User Story 2 — View MCAP $ on Bonding Curve Visualization (P1)

> **Goal**: Bonding curve SVG shows MCAP USD Y-axis labels and a graduation target line.
> **Depends on**: Phase 1 (T001, T002)
> **Can run in parallel with**: Phase 2

- [x] T005 [US2] Rewrite `BondingCurveVisual` in `frontend/src/components/shared/BondingCurveVisual.tsx`: (a) add `btcPrice: number` to `BondingCurveVisualProps` interface; (b) import `priceSatsToMcapUsd`, `formatMcapUsd` from `@/lib/format` and `TOTAL_SUPPLY_WHOLE_TOKENS, SATS_PER_BTC, TOKEN_UNITS_PER_TOKEN` from constants; (c) in `points` useMemo, convert each point's Y from normalized price to MCAP USD using `priceSatsToMcapUsd(priceValue, btcPrice)` where `priceValue = btc * TOKEN_UNITS_PER_TOKEN / K.div(btc).toNumber()`; (d) scale SVG Y coordinates from 0 to `maxMcap` (the highest MCAP value) instead of 0–1; (e) increase left padding to ~45px and add Y-axis text labels at bottom ("$0"), midpoint, and top (graduation mcap, e.g., "$69k"); (f) add a dashed horizontal line at the graduation MCAP level; (g) add `btcPrice` to useMemo dependency arrays.

- [x] T006 [US2] In `frontend/src/pages/TokenPage.tsx`, pass `btcPrice={btcPrice}` to `<BondingCurveVisual>` (line 194–198).

---

## Phase 4: User Story 3 — View Graduation Progress in MCAP $ (P2)

> **Goal**: Graduation progress labels show current and target MCAP in USD.
> **Depends on**: Phase 1 (T001, T002)
> **Can run in parallel with**: Phases 2 and 3

- [x] T007 [US3] Update `GraduationProgress` in `frontend/src/components/shared/GraduationProgress.tsx`: (a) add `btcPrice?: number` and `marketCapSats?: number` to props interface; (b) import `formatMcapUsd` from `@/lib/format` and `SATS_PER_BTC, INITIAL_VIRTUAL_BTC_SATS, K, TOKEN_UNITS_PER_TOKEN, TOTAL_SUPPLY_WHOLE_TOKENS, GRADUATION_THRESHOLD_SATS` from constants; (c) compute graduation MCAP target: `gradVBtc = INITIAL_VIRTUAL_BTC_SATS.toNumber() + GRADUATION_THRESHOLD_SATS`, `gradVToken = K.div(gradVBtc).toNumber()`, `gradPrice = gradVBtc * TOKEN_UNITS_PER_TOKEN / gradVToken`, `gradMcapUsd = gradPrice * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice`; (d) compute current MCAP USD: `currentMcapUsd = (marketCapSats ?? 0) / SATS_PER_BTC * btcPrice`; (e) in the bottom labels (lines 52–55), when `btcPrice > 0`: show `formatMcapUsd(currentMcapUsd)` on the left and `formatMcapUsd(gradMcapUsd)` on the right; when `btcPrice` is falsy, fall back to existing `formatBtc` display.

- [x] T008 [US3] In `frontend/src/pages/TokenPage.tsx`, add `btcPrice={btcPrice}` and `marketCapSats={token.marketCapSats}` to both `<GraduationProgress>` instances (lines 199–203 and 261–265). TokenCard's compact usage (no labels) requires no changes.

---

## Phase 5: Verification

> **Goal**: Confirm all changes compile and render correctly.

- [x] T009 Run `cd frontend && npm run build` to verify no TypeScript errors across all modified files.

- [x] T010 Manual verification checklist:
  - Chart Y-axis shows dollar MCAP values ($690 → $69k range at ~$90k BTC)
  - Crosshair tooltip shows MCAP $ on hover
  - Chart header reads "Market Cap"
  - Bonding curve SVG has Y-axis labels ($0, midpoint, ~$69k) and graduation target line
  - Bonding curve current-position dot is correctly placed
  - Graduation progress (sidebar + bonding curve tab) shows MCAP $ labels
  - TokenCard compact progress bar is unaffected
  - Page loads cleanly when btcPrice has not yet loaded (no NaN, no broken values)

---

## Dependency Graph

```
Phase 1: T001 ──┐
         T002 ──┤
                ├── Phase 2: T003 → T004  (US1 - Price Chart)
                ├── Phase 3: T005 → T006  (US2 - Bonding Curve)
                └── Phase 4: T007 → T008  (US3 - Graduation Progress)
                                    │
                              Phase 5: T009 → T010  (Verification)
```

**Parallel opportunities**: T001/T002 (different files), Phases 2/3/4 (independent components after Phase 1).

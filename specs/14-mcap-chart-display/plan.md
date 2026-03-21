# Implementation Plan: MCAP $ Display on Charts & Bonding Curve

**Branch**: `14-mcap-chart-display` | **Date**: 2026-03-21 | **Spec**: specs/14-mcap-chart-display/spec.md

## Summary

Replace raw pricePerToken values on the price chart Y-axis with Market Cap in USD. Apply the same MCAP $ display to the bonding curve visualization and graduation progress indicators. The core change is a display-layer transformation: `mcapUsd = pricePerToken × 10 × btcPrice`.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 18, lightweight-charts 4.2.1, BigNumber.js, Radix UI Progress
**Storage**: None (display-only change)
**Testing**: Manual verification (existing test suite unaffected — no API/data changes)
**Target Platform**: Web (Vite SPA)
**Project Type**: Monorepo (frontend/, netlify/, contracts/, shared/)
**Constraints**: Must not break compact GraduationProgress in TokenCard; must handle btcPrice=0 gracefully

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | Frontend-only, no contract math |
| Frontend never holds signing keys | PASS | No signing changes |
| API responses follow shared types | PASS | No API type changes |
| Mempool-first UI updates | PASS | Display-only transform; data pipeline unchanged |

---

## Implementation Steps

### Step 1: Add conversion constant and helpers

**File**: `frontend/src/config/constants.ts` (line 15, after GRADUATION_THRESHOLD_SATS)

Add:
```typescript
export const TOTAL_SUPPLY_WHOLE_TOKENS = 1_000_000_000; // 1B tokens (INITIAL_VIRTUAL_TOKEN_SUPPLY / TOKEN_UNITS_PER_TOKEN)
```

**File**: `frontend/src/lib/format.ts` (after `formatUsdPrice`, ~line 94)

Add two functions:
```typescript
/** Convert a pricePerToken value (from candles/trades) to market cap in USD */
export function priceSatsToMcapUsd(pricePerToken: number, btcPrice: number): number {
  // mcapSats = pricePerToken × TOTAL_SUPPLY_WHOLE_TOKENS
  // mcapUsd = mcapSats / SATS_PER_BTC × btcPrice
  // Simplified: pricePerToken × 10 × btcPrice
  return pricePerToken * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice;
}

/** Format a USD market cap value for chart axes and labels */
export function formatMcapUsd(value: number): string {
  if (value === 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}
```

Import `TOTAL_SUPPLY_WHOLE_TOKENS` from constants.

**Satisfies**: FR-006, FR-007

---

### Step 2: Update PriceChart to accept a custom formatter

**File**: `frontend/src/components/chart/PriceChart.tsx`

Changes:
1. Add `priceFormatter?: (value: number) => string` to `PriceChartProps` interface (line 7-11)
2. In the `priceFormat` block (lines 80-92), use the prop if provided:
   - Replace hardcoded formatter with: `formatter: priceFormatter ?? defaultFormatter`
   - Extract current formatter to a `defaultFormatter` const
3. Update `minMove` to `0.01` when priceFormatter is provided (USD values don't need 10^-8 precision)
4. Update the autoscale provider's fallback margin (line 73): change `0.00000001` to `1` when dealing with USD-scale values

**Satisfies**: FR-001, FR-002

---

### Step 3: Transform candle data to MCAP USD in TokenPage

**File**: `frontend/src/pages/TokenPage.tsx`

Changes:
1. Import `useMemo` from React (add to existing import)
2. Import `priceSatsToMcapUsd`, `formatMcapUsd` from `@/lib/format`
3. After line 39 (`const { btcPrice } = useBtcPrice()`), add a memoized transform:
   ```typescript
   const mcapCandles = useMemo(() => {
     if (btcPrice <= 0) return candles;
     return candles.map((c) => ({
       ...c,
       open: priceSatsToMcapUsd(c.open, btcPrice),
       high: priceSatsToMcapUsd(c.high, btcPrice),
       low: priceSatsToMcapUsd(c.low, btcPrice),
       close: priceSatsToMcapUsd(c.close, btcPrice),
     }));
   }, [candles, btcPrice]);
   ```
4. Update PriceChart usage (line 118):
   ```tsx
   <PriceChart candles={mcapCandles} loading={chartLoading} priceFormatter={formatMcapUsd} />
   ```
5. Update chart header label (line 115): change "Price Chart" to "Market Cap"

**Satisfies**: FR-001, FR-002, FR-006

---

### Step 4: Update BondingCurveVisual to show MCAP $

**File**: `frontend/src/components/shared/BondingCurveVisual.tsx`

Changes:
1. Add `btcPrice: number` to `BondingCurveVisualProps` interface
2. Import `TOTAL_SUPPLY_WHOLE_TOKENS, SATS_PER_BTC, TOKEN_UNITS_PER_TOKEN` from constants
3. Rewrite the `points` useMemo to compute Y values as MCAP USD instead of normalized price:
   - For each step, compute `price = btc^2 / K` (current formula), then convert to mcapUsd
   - `mcapUsd = (btc * TOKEN_UNITS_PER_TOKEN / K.div(btc).toNumber()) * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice`
   - Actually simpler: the existing price calculation already gives `btc^2/K`. Convert using `priceSatsToMcapUsd`
4. Compute graduation MCAP target: `graduationMcap = priceSatsToMcapUsd(gradPricePerToken, btcPrice)` where gradPricePerToken is the price at graduation
5. Y-axis: No longer normalize to 0-1. Use actual MCAP USD values and scale the SVG viewBox accordingly
6. Add Y-axis labels: "$0" at bottom, graduation mcap (e.g., "$69k") at top, midpoint label
7. Add a dashed horizontal line at the graduation MCAP level
8. Increase left padding to accommodate labels (~40px)

**File**: `frontend/src/pages/TokenPage.tsx` (line 194-198)
- Pass `btcPrice={btcPrice}` to `BondingCurveVisual`

**Satisfies**: FR-003, FR-004, FR-006

---

### Step 5: Update GraduationProgress to show MCAP $

**File**: `frontend/src/components/shared/GraduationProgress.tsx`

Changes:
1. Add `btcPrice?: number` and `marketCapSats?: number` to `GraduationProgressProps`
2. Import `formatMcapUsd`, `priceSatsToMcapUsd` from `@/lib/format` and `GRADUATION_THRESHOLD_SATS, SATS_PER_BTC, INITIAL_VIRTUAL_BTC_SATS, K, TOKEN_UNITS_PER_TOKEN, TOTAL_SUPPLY_WHOLE_TOKENS` from constants
3. Compute graduation MCAP target in USD:
   - `graduationVirtualBtc = INITIAL_VIRTUAL_BTC_SATS + GRADUATION_THRESHOLD_SATS`
   - `graduationVirtualToken = K / graduationVirtualBtc`
   - `gradPricePerToken = graduationVirtualBtc * TOKEN_UNITS_PER_TOKEN / graduationVirtualToken`
   - `gradMcapUsd = gradPricePerToken * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice`
4. Compute current MCAP USD from `marketCapSats` prop: `currentMcapUsd = marketCapSats * btcPrice / SATS_PER_BTC`
5. Replace bottom labels (line 52-55):
   - Left: `formatMcapUsd(currentMcapUsd)` instead of `formatBtc(realBtcSats)`
   - Right: `formatMcapUsd(gradMcapUsd)` instead of `formatBtc(GRADUATION_THRESHOLD_SATS)`
6. When `btcPrice` is not provided (e.g., compact TokenCard), fall back to current BTC display

**File**: `frontend/src/pages/TokenPage.tsx`
- Both GraduationProgress instances (lines 199-203 and 261-265): add `btcPrice={btcPrice}` and `marketCapSats={token.marketCapSats}`

**Note**: TokenCard (compact mode) does not render labels, so no changes needed there.

**Satisfies**: FR-005, FR-006, FR-007

---

## Files Modified

| File | Lines Changed | Change |
|------|--------------|--------|
| `frontend/src/config/constants.ts` | +1 | Add `TOTAL_SUPPLY_WHOLE_TOKENS` |
| `frontend/src/lib/format.ts` | +15 | Add `priceSatsToMcapUsd()`, `formatMcapUsd()` |
| `frontend/src/components/chart/PriceChart.tsx` | ~10 | Accept `priceFormatter` prop |
| `frontend/src/pages/TokenPage.tsx` | ~15 | Transform candles, pass btcPrice to components |
| `frontend/src/components/shared/BondingCurveVisual.tsx` | ~40 | MCAP Y-axis labels, graduation line |
| `frontend/src/components/shared/GraduationProgress.tsx` | ~10 | MCAP $ labels instead of BTC |

## Verification

1. **Build**: `cd frontend && npm run build` — no TypeScript errors
2. **Visual check on token page**:
   - Chart Y-axis shows "$690" → "$69k" range (at ~$90k BTC)
   - Crosshair tooltip shows MCAP $ on hover
   - Chart header says "Market Cap"
3. **Bonding curve tab**:
   - SVG shows Y-axis labels with "$0", "$35k", "$69k" style labels
   - Dashed graduation target line visible
   - Current position dot correctly placed
4. **Graduation progress** (sidebar + bonding curve tab):
   - Bottom labels show current MCAP $ and target ~"$69k"
5. **TokenCard** (homepage): compact GraduationProgress still renders correctly (no labels)
6. **Edge case**: Refresh page before BTC price loads — chart should show candles without breaking (btcPrice=0 → no transform)

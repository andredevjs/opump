# Implementation Plan: Replace Token Unit Price with MCAP Display

**Branch**: 15-mcap-replace-price | **Date**: 2026-03-21 | **Spec**: specs/15-mcap-replace-price/spec.md

## Summary

Replace all per-token unit price displays with market cap (MCAP) in USD. The codebase already has MCAP calculation and formatting utilities (`priceSatsToMcapUsd`, `formatMcapUsd`). This is a UI-only change affecting 3 files: `TokenPrice.tsx`, `TokenList.tsx`, and their consumers.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 18, Vite, TailwindCSS
**Storage**: N/A (display-only change)
**Testing**: Manual visual verification
**Target Platform**: Web SPA
**Project Type**: Web application (frontend only)
**Performance Goals**: No performance impact — same data, different formatter
**Constraints**: Mempool-first architecture — MCAP must update in real time

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | No contract changes |
| Frontend never holds signing keys | N/A | No signing changes |
| Shared type definitions | OK | No type changes needed |
| Mempool-first updates | OK | Same reactive pipeline, different display format |

**Result**: No violations.

## Implementation Steps

### Step 1: Refactor `TokenPrice` component to display MCAP

**File**: `frontend/src/components/token/TokenPrice.tsx`

**Changes**:
1. Import `priceSatsToMcapUsd` and `formatMcapUsd` instead of `formatUsdPrice`
2. Compute MCAP: `const mcap = priceSatsToMcapUsd(priceSats, btcPrice)`
3. Display: `{formatMcapUsd(mcap)} MCAP` instead of `{formatUsdPrice(priceSats, btcPrice)}`
4. Keep the optimistic `~` prefix and `pending` label behavior
5. Keep the 24h change badge as-is (percentage is identical for price and MCAP)

**Impact**: All consumers of `<TokenPrice>` automatically get MCAP display:
- `TokenCard.tsx:48` — token cards on homepage, profile, search
- `TokenPage.tsx:98` — token detail page header

### Step 2: Update `TokenList` table to show MCAP

**File**: `frontend/src/components/token/TokenList.tsx`

**Changes**:
1. Import `priceSatsToMcapUsd`, `formatMcapUsd` instead of `formatUsdPrice`
2. Change column header from `Price` to `MCAP` (line 22)
3. Replace cell content: `formatMcapUsd(priceSatsToMcapUsd(token.currentPriceSats, btcPrice))` + ` MCAP` label (line 58)

### Step 3: Verify no other unit price displays remain

**Files to verify** (already confirmed — no changes needed):
- `TrenchTokenRow.tsx` — already shows `MC` via `formatUsd(token.marketCapSats, ...)`
- `TokenCard.tsx` stats grid — shows MCap via `formatUsd(token.marketCapSats, ...)`
- `TokenPage.tsx` stats row — shows Market Cap via `formatUsd(token.marketCapSats, ...)`
- Chart, BondingCurveVisual, GraduationProgress — already use `formatMcapUsd`
- Trade forms, trade history, holdings — show BTC/USD amounts, not per-token price

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `frontend/src/components/token/TokenPrice.tsx` | Modify | Switch from `formatUsdPrice` to `formatMcapUsd(priceSatsToMcapUsd(...))`, add "MCAP" label |
| `frontend/src/components/token/TokenList.tsx` | Modify | Change header "Price" → "MCAP", replace `formatUsdPrice` call with MCAP formatter |

## Files NOT Changed (confirmed safe)

| File | Reason |
|------|--------|
| `TokenCard.tsx` | Uses `<TokenPrice>` — gets MCAP automatically via Step 1 |
| `TokenPage.tsx` | Uses `<TokenPrice>` — gets MCAP automatically via Step 1 |
| `TrenchTokenRow.tsx` | Already shows MC, no unit price |
| `BondingCurveVisual.tsx` | Already uses `formatMcapUsd` |
| `GraduationProgress.tsx` | Already uses `formatMcapUsd` |
| `PriceChart.tsx` | Already uses `formatMcapUsd` via TokenPage |
| `format.ts` | No changes — `formatUsdPrice` stays (unused but harmless) |

## Risk Assessment

**Low risk** — This is a pure display change:
- No data model changes
- No API changes
- No state management changes
- Existing MCAP utilities are already proven (used by chart, bonding curve, graduation)
- Same reactive data pipeline, just different formatter at render time

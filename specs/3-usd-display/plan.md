# Implementation Plan: USD Value Display

**Branch**: `3-usd-display` | **Date**: 2026-03-19 | **Spec**: `specs/3-usd-display/spec.md`

## Summary

Replace all sats/BTC monetary displays across the app with US dollar values. Add a BTC/USD price feed (CoinGecko free API), new USD formatting utilities, and update every component that shows monetary values. Trade form inputs change from BTC to USD with auto-conversion.

## Technical Context

| Field | Value |
|-------|-------|
| **Language/Version** | TypeScript 5.x, React 18 |
| **Primary Dependencies** | Zustand 5, React Router 6, TailwindCSS 3, BigNumber.js |
| **Storage** | Zustand stores + localStorage (price cache) |
| **Testing** | Manual (no test framework currently set up) |
| **Target Platform** | Web SPA (Vite) |
| **Performance Goals** | No perceptible delay on price display; price refresh ≤ 2 min |
| **Constraints** | CoinGecko free tier (10-30 req/min); no backend changes needed |

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | No contract changes |
| Frontend never holds signing keys | PASS | No signing changes |
| API responses follow shared types | PASS | No API response changes — conversion is display-layer only |
| Mempool-first UI updates | PASS | No changes to data flow — only formatting output changes |

## Architecture Overview

```
                    CoinGecko API
                         │
                    (fetch every 2 min)
                         │
                         ▼
               ┌─────────────────┐
               │ btc-price-store │◄── localStorage (cached price)
               │   btcUsdPrice   │
               │   lastFetchedAt │
               └────────┬────────┘
                        │
                   useBtcPrice()
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
      formatUsd()  formatUsdPrice()  usdToSats()
            │           │           │
            ▼           ▼           ▼
     [All display   [TokenPrice  [BuyForm
      components]    component]   input]
```

**Key design decision**: The BTC/USD rate lives in a dedicated Zustand store. Format functions are pure — they accept `(sats, btcPrice)` and return a string. Components get `btcPrice` via the `useBtcPrice()` hook and pass it to formatters. This keeps the conversion layer thin and testable.

## Phase 1 — Price Feed & Utilities

### 1.1 Create BTC price store

**File**: `frontend/src/stores/btc-price-store.ts`

New Zustand store with:
- State: `btcUsdPrice: number`, `lastFetchedAt: number`, `loading: boolean`
- Action: `fetchBtcPrice()` — calls CoinGecko, updates state + localStorage
- On create: load cached price from `localStorage.getItem('btc-usd-price')`, start 2-minute interval
- Selector hook: `useBtcPrice()` returning `{ btcPrice, loading }`

**localStorage schema**:
```json
{ "price": 65000, "timestamp": 1710806400000 }
```

### 1.2 Add USD format functions

**File**: `frontend/src/lib/format.ts`

Add new functions:
```
satsToUsd(sats: number | string, btcPrice: number): number
usdToSats(usd: number, btcPrice: number): number
formatUsd(sats: number | string, btcPrice: number): string
formatUsdPrice(sats: number, btcPrice: number): string
```

**Formatting rules for `formatUsd()`**:
| USD Value | Output |
|-----------|--------|
| ≥ 1B | "$X.XB" |
| ≥ 1M | "$X.XM" |
| ≥ 1k | "$X.Xk" |
| ≥ 1 | "$X.XX" |
| ≥ 0.01 | "$0.XX" |
| < 0.01 | "$0.00XXXX" (enough decimals to show 2 significant digits) |

**Formatting rules for `formatUsdPrice()`** (single token price — needs more precision):
| USD Value | Output |
|-----------|--------|
| ≥ 1 | "$X.XXXXXX" (6 decimals) |
| ≥ 0.01 | "$0.XXXXXX" (6 decimals) |
| < 0.01 | "$0.00...XXXX" (enough decimals for 4 significant digits) |

### 1.3 Initialize price fetch on app mount

**File**: `frontend/src/App.tsx` (or root layout)

Call `useBtcPrice()` at the app root so the store initializes and starts polling on mount. This ensures the price is available before any component renders.

## Phase 2 — Homepage Components (P1)

### 2.1 Update PlatformStats

**File**: `frontend/src/components/home/PlatformStats.tsx`

- Import `useBtcPrice` hook
- Change `formatBtc(stats.totalVolumeSats)` → `formatUsd(stats.totalVolumeSats, btcPrice)`

### 2.2 Update TokenCard

**File**: `frontend/src/components/token/TokenCard.tsx`

- Import `useBtcPrice` hook
- Change `formatBtc(token.volume24hSats)` → `formatUsd(token.volume24hSats, btcPrice)`
- Change `formatBtc(token.marketCapSats)` → `formatUsd(token.marketCapSats, btcPrice)`
- Pass `btcPrice` to child `TokenPrice` component

### 2.3 Update TokenPrice

**File**: `frontend/src/components/token/TokenPrice.tsx`

- Add `btcPrice: number` to props
- Change `formatPrice(priceSats)` → `formatUsdPrice(priceSats, btcPrice)`

### 2.4 Update TokenList

**File**: `frontend/src/components/token/TokenList.tsx`

- Import `useBtcPrice` hook
- Change `formatPrice(token.currentPriceSats)` → `formatUsdPrice(token.currentPriceSats, btcPrice)`
- Change `formatBtc(token.volume24hSats)` → `formatUsd(token.volume24hSats, btcPrice)`

## Phase 3 — Token Detail & Trenches (P2)

### 3.1 Update TokenPage

**File**: `frontend/src/pages/TokenPage.tsx`

- Import `useBtcPrice` hook
- Change stats grid: `formatBtc(token.volume24hSats)` → `formatUsd(..., btcPrice)`
- Change stats grid: `formatBtc(token.marketCapSats)` → `formatUsd(..., btcPrice)`
- Pass `btcPrice` to `TokenPrice` component in header
- **Exception**: `GraduationProgress` keeps BTC display (protocol values)

### 3.2 Update TradeHistory

**File**: `frontend/src/components/trade/TradeHistory.tsx`

- Import `useBtcPrice` hook
- Change "BTC" column: `formatBtc(trade.btcAmount)` → `formatUsd(trade.btcAmount, btcPrice)`
- Update column header from "BTC" to "Value"

### 3.3 Update TrenchesPage

**File**: `frontend/src/pages/TrenchesPage.tsx` (if it has direct formatting) or rely on TokenCard/TokenList updates from Phase 2.

- Verify that the grid/table views use TokenCard and TokenList components (which are already updated)
- If any direct formatting exists in TrenchesPage, update it

## Phase 4 — Profile Page (P2)

### 4.1 Update ProfileHeader

**File**: `frontend/src/components/profile/ProfileHeader.tsx`

- Import `useBtcPrice` hook
- Change `formatBtc(profile.totalVolumeSats)` → `formatUsd(profile.totalVolumeSats, btcPrice)`

### 4.2 Update CreatorFeeCard

**File**: `frontend/src/components/token/CreatorFeeCard.tsx`

- Import `useBtcPrice` hook
- Change `formatBtc(claimableSats)` → `formatUsd(claimableSats, btcPrice)`

### 4.3 Update MinterRewardCard

**File**: `frontend/src/components/token/MinterRewardCard.tsx`

- Import `useBtcPrice` hook
- Change `formatBtc(minterPoolSats)` → `formatUsd(minterPoolSats, btcPrice)`

## Phase 5 — Trade Forms (P3)

### 5.1 Update BuyForm

**File**: `frontend/src/components/trade/BuyForm.tsx`

Major changes:
- Import `useBtcPrice` hook
- **Input field**: Change from BTC input to USD input
  - Label changes from "Amount (BTC)" to "Amount (USD)"
  - Conversion: `usdToSats(usdAmount, btcPrice)` before calling `executeBuy()`
- **Quick amount buttons**: Change from `[0.001, 0.005, 0.01, 0.05]` BTC to `[5, 25, 50, 250]` USD
- **Balance display**: `formatBtc(balanceSats)` → `formatUsd(balanceSats, btcPrice)`
- **Simulation output**: Pass `btcPrice` to FeeBreakdown

### 5.2 Update SellForm

**File**: `frontend/src/components/trade/SellForm.tsx`

- Import `useBtcPrice` hook
- **Output display**: `formatBtc(simulation.outputAmount)` → `formatUsd(simulation.outputAmount, btcPrice)`
- **Balance display** (if showing BTC balance): → `formatUsd(..., btcPrice)`
- Pass `btcPrice` to FeeBreakdown

### 5.3 Update FeeBreakdown

**File**: `frontend/src/components/shared/FeeBreakdown.tsx`

- Add `btcPrice: number` to props
- Change all `formatBtc(fee)` calls → `formatUsd(fee, btcPrice)`

## Phase 6 — Cleanup

### 6.1 Remove unused sats formatters

**File**: `frontend/src/lib/format.ts`

After all components are migrated:
- Remove `formatBtc()` (replaced by `formatUsd()`)
- Remove `formatPrice()` (replaced by `formatUsdPrice()`)
- Remove `formatSats()` (no longer used)
- Keep `satsToBtc()`, `btcToSats()` — still needed internally for `GraduationProgress`
- Keep `formatTokenAmount()` — token quantities are not affected

### 6.2 Update labels and copy

Across all updated components:
- Remove "sats" / "BTC" text labels where they appear next to values
- Ensure column headers say "Value" or "Price" (not "BTC")
- Quick amount buttons show "$" prefix

## File Change Summary

| File | Change Type | Phase |
|------|-------------|-------|
| `frontend/src/stores/btc-price-store.ts` | **NEW** | 1 |
| `frontend/src/lib/format.ts` | MODIFY (add 4 functions, remove 3) | 1, 6 |
| `frontend/src/App.tsx` | MODIFY (init price store) | 1 |
| `frontend/src/components/home/PlatformStats.tsx` | MODIFY | 2 |
| `frontend/src/components/token/TokenCard.tsx` | MODIFY | 2 |
| `frontend/src/components/token/TokenPrice.tsx` | MODIFY (new prop) | 2 |
| `frontend/src/components/token/TokenList.tsx` | MODIFY | 2 |
| `frontend/src/pages/TokenPage.tsx` | MODIFY | 3 |
| `frontend/src/components/trade/TradeHistory.tsx` | MODIFY | 3 |
| `frontend/src/components/profile/ProfileHeader.tsx` | MODIFY | 4 |
| `frontend/src/components/token/CreatorFeeCard.tsx` | MODIFY | 4 |
| `frontend/src/components/token/MinterRewardCard.tsx` | MODIFY | 4 |
| `frontend/src/components/trade/BuyForm.tsx` | MODIFY (major) | 5 |
| `frontend/src/components/trade/SellForm.tsx` | MODIFY | 5 |
| `frontend/src/components/shared/FeeBreakdown.tsx` | MODIFY (new prop) | 5 |

**Total**: 1 new file, 14 modified files.

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CoinGecko rate limit hit | Low | Medium | 2-min interval well within limit; localStorage cache ensures continuity |
| CoinGecko API down | Low | Low | Cached price serves indefinitely; no sats fallback needed |
| Sub-cent formatting unreadable | Medium | Low | `formatUsdPrice` uses 4+ significant digits for small values |
| BuyForm USD→sats rounding | Medium | Medium | Round to nearest sat after conversion; validate minimum trade size |
| Price stale during fast BTC moves | Low | Low | 2-min staleness is acceptable per spec; BTC rarely moves >1% in 2 min |

## Not In Scope

- Graduation progress bar (keeps BTC — protocol values)
- Token amount displays (these are token quantities, not monetary)
- Contract changes (none needed)
- Backend/API changes (none needed — conversion is display-layer only)
- Chart Y-axis (OHLCV candles — future enhancement if desired)

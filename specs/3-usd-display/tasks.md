# Tasks: USD Value Display

**Branch**: `3-usd-display` | **Generated**: 2026-03-19
**Spec**: `specs/3-usd-display/spec.md` | **Plan**: `specs/3-usd-display/plan.md`

---

## Phase 1: Foundational — Price Feed & USD Utilities
> **Blocks**: All subsequent phases. Must complete first.

- [x] T001 Create BTC price Zustand store at `frontend/src/stores/btc-price-store.ts` — state: `btcUsdPrice`, `lastFetchedAt`, `loading`; action: `fetchBtcPrice()` calling CoinGecko `/simple/price` endpoint; on create: load cached price from `localStorage.getItem('btc-usd-price')`, start 2-minute polling interval; export `useBtcPrice()` selector hook returning `{ btcPrice, loading }`
- [x] T002 Add USD format and conversion functions to `frontend/src/lib/format.ts` — add `satsToUsd(sats: number | string, btcPrice: number): number`, `usdToSats(usd: number, btcPrice: number): number`, `formatUsd(sats: number | string, btcPrice: number): string` (general monetary: "$X.XX", "$X.Xk", "$X.XM", "$X.XB"; sub-cent: enough decimals for 2 significant digits), `formatUsdPrice(sats: number, btcPrice: number): string` (token price with 4-6 significant digits for small values)
- [x] T003 Initialize BTC price store on app mount in `frontend/src/App.tsx` (or root layout) — call `useBtcPrice()` at the top level so the store starts polling before any child component renders

## Phase 2: User Story 1 & 2 — Homepage (P1)
> **Depends on**: Phase 1
> **Goal**: All monetary values on the homepage display in USD — token cards, token list, platform stats.

- [x] T004 [US2] Update `frontend/src/components/home/PlatformStats.tsx` — import `useBtcPrice`, change `formatBtc(stats.totalVolumeSats)` → `formatUsd(stats.totalVolumeSats, btcPrice)`
- [x] T005 [US1] Update `frontend/src/components/token/TokenPrice.tsx` — add `btcPrice: number` to `TokenPriceProps` interface, change `formatPrice(priceSats)` → `formatUsdPrice(priceSats, btcPrice)`
- [x] T006 [US1] Update `frontend/src/components/token/TokenCard.tsx` — import `useBtcPrice`, change `formatBtc(token.volume24hSats)` → `formatUsd(token.volume24hSats, btcPrice)`, change `formatBtc(token.marketCapSats)` → `formatUsd(token.marketCapSats, btcPrice)`, pass `btcPrice` prop to child `TokenPrice` component
- [x] T007 [US1] Update `frontend/src/components/token/TokenList.tsx` — import `useBtcPrice`, change `formatPrice(token.currentPriceSats)` → `formatUsdPrice(token.currentPriceSats, btcPrice)`, change `formatBtc(token.volume24hSats)` → `formatUsd(token.volume24hSats, btcPrice)`

> **Parallel note**: T004 is independent (PlatformStats). T005 must complete before T006 (TokenCard passes btcPrice to TokenPrice). T007 is independent of T005/T006.

## Phase 3: User Story 3 & 4 — Token Detail & Trenches (P2)
> **Depends on**: Phase 2 (TokenPrice and TokenCard already updated)
> **Goal**: Token detail page and Trenches page show USD values consistently.

- [x] T008 [US3] Update `frontend/src/pages/TokenPage.tsx` — import `useBtcPrice`, change stats grid `formatBtc(token.volume24hSats)` → `formatUsd(token.volume24hSats, btcPrice)`, change `formatBtc(token.marketCapSats)` → `formatUsd(token.marketCapSats, btcPrice)`, pass `btcPrice` to `TokenPrice` in header; leave `GraduationProgress` unchanged (protocol BTC values)
- [x] T009 [P] [US3] Update `frontend/src/components/trade/TradeHistory.tsx` — import `useBtcPrice`, change `formatBtc(trade.btcAmount)` → `formatUsd(trade.btcAmount, btcPrice)`, rename column header from "BTC" to "Value"
- [x] T010 [US4] Verify `frontend/src/pages/TrenchesPage.tsx` uses TokenCard/TokenList components (already updated in Phase 2); if any direct `formatBtc`/`formatPrice` calls exist in TrenchesPage itself, update them to `formatUsd`/`formatUsdPrice`

## Phase 4: User Story 6 — Profile Page (P2)
> **Depends on**: Phase 1 only (can run in parallel with Phase 3)
> **Goal**: Profile total volume, creator fees, and minter rewards display in USD.

- [x] T011 [P] [US6] Update `frontend/src/components/profile/ProfileHeader.tsx` — import `useBtcPrice`, change `formatBtc(profile.totalVolumeSats)` → `formatUsd(profile.totalVolumeSats, btcPrice)`
- [x] T012 [P] [US6] Update `frontend/src/components/token/CreatorFeeCard.tsx` — import `useBtcPrice`, change `formatBtc(claimableSats)` → `formatUsd(claimableSats, btcPrice)`
- [x] T013 [P] [US6] Update `frontend/src/components/token/MinterRewardCard.tsx` — import `useBtcPrice`, change `formatBtc(minterPoolSats)` → `formatUsd(minterPoolSats, btcPrice)`

## Phase 5: User Story 5 — Trade Forms (P3)
> **Depends on**: Phase 1 only (can run in parallel with Phases 3-4)
> **Goal**: Trade form inputs accept USD, outputs and fees display in USD.

- [x] T014 [US5] Update `frontend/src/components/shared/FeeBreakdown.tsx` — add `btcPrice: number` to `FeeBreakdownProps`, change all `formatBtc(fee)` calls → `formatUsd(fee, btcPrice)`
- [x] T015 [US5] Update `frontend/src/components/trade/BuyForm.tsx` — import `useBtcPrice`; change input from BTC to USD (label: "Amount (USD)"); change quick amount buttons from `[0.001, 0.005, 0.01, 0.05]` BTC to `[5, 25, 50, 250]` USD with "$" prefix; change balance display `formatBtc(balanceSats)` → `formatUsd(balanceSats, btcPrice)`; convert input to sats via `usdToSats(usdAmount, btcPrice)` before `executeBuy()`; pass `btcPrice` to `FeeBreakdown`
- [x] T016 [US5] Update `frontend/src/components/trade/SellForm.tsx` — import `useBtcPrice`; change output display `formatBtc(simulation.outputAmount)` → `formatUsd(simulation.outputAmount, btcPrice)`; update any BTC balance display → `formatUsd(..., btcPrice)`; pass `btcPrice` to `FeeBreakdown`

> **Dependency note**: T014 (FeeBreakdown) should complete before T015/T016 since both forms pass btcPrice to FeeBreakdown.

## Phase 6: Cleanup
> **Depends on**: All previous phases complete.
> **Goal**: Remove dead code, fix stale labels.

- [x] T017 Remove unused sats formatters from `frontend/src/lib/format.ts` — deleted `formatPrice()`, `formatSats()`; kept `formatBtc()` (still used by GraduationProgress), `satsToBtc()`, `btcToSats()`, `formatTokenAmount()`, `formatPercent()`, `formatNumber()`
- [x] T018 Audit all updated components for stale labels — grep for remaining "sats", "BTC" text in display strings (not variable names); update column headers to "Value" or "Price" where needed; ensure quick amount buttons show "$" prefix; do NOT change GraduationProgress labels

---

## Summary

| Metric | Count |
|--------|-------|
| Total tasks | 18 |
| Phase 1 (Foundational) | 3 |
| Phase 2 (US1+US2 Homepage) | 4 |
| Phase 3 (US3+US4 Detail/Trenches) | 3 |
| Phase 4 (US6 Profile) | 3 |
| Phase 5 (US5 Trade Forms) | 3 |
| Phase 6 (Cleanup) | 2 |
| Parallelizable tasks | 5 (marked [P]) |
| New files | 1 |
| Modified files | 14 |

## Dependency Graph

```
Phase 1 (T001-T003)
    │
    ├──► Phase 2 (T004-T007) ──► Phase 3 (T008-T010)
    │
    ├──► Phase 4 (T011-T013)  ◄── can run parallel with Phase 3
    │
    └──► Phase 5 (T014-T016)  ◄── can run parallel with Phases 3-4
                                    │
                     All phases ────► Phase 6 (T017-T018)
```

## MVP Scope

**Phases 1 + 2** (T001–T007) deliver the core value: homepage token cards, token list, and platform stats all in USD. This covers User Stories 1 and 2 (both P1) and is independently testable.

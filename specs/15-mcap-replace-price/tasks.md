# Tasks: Replace Token Unit Price with MCAP Display

## Phase 1 — Implementation

- [x] T1: Refactor `TokenPrice` component to display MCAP instead of unit price
  - File: `frontend/src/components/token/TokenPrice.tsx`
  - Import `priceSatsToMcapUsd`, `formatMcapUsd` instead of `formatUsdPrice`
  - Compute MCAP from priceSats + btcPrice, display with "MCAP" label
  - Keep 24h change badge and optimistic indicators

- [x] T2: Update `TokenList` table to show MCAP instead of unit price
  - File: `frontend/src/components/token/TokenList.tsx`
  - Change column header "Price" → "MCAP"
  - Replace `formatUsdPrice` call with `formatMcapUsd(priceSatsToMcapUsd(...))`

## Phase 2 — Verification

- [x] T3: Verify build compiles without errors
- [x] T4: Visual verification — confirm no remaining unit price displays

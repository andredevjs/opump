# Research: Replace Token Unit Price with MCAP Display

## Current State Analysis

### Where unit price is displayed (MUST change)

| Location | File | Current Code |
|----------|------|-------------|
| TokenPrice component | `frontend/src/components/token/TokenPrice.tsx` | `formatUsdPrice(priceSats, btcPrice)` |
| TokenCard | `frontend/src/components/token/TokenCard.tsx:48` | `<TokenPrice priceSats={...} />` |
| TokenList table cell | `frontend/src/components/token/TokenList.tsx:58` | `formatUsdPrice(token.currentPriceSats, btcPrice)` |
| TokenList table header | `frontend/src/components/token/TokenList.tsx:22` | `<th>Price</th>` |
| TokenPage header | `frontend/src/pages/TokenPage.tsx:98` | `<TokenPrice priceSats={...} />` |

### Where MCAP is already displayed (NO change)

| Location | File | Notes |
|----------|------|-------|
| Chart Y-axis | `TokenPage.tsx:41-50, 129` | Uses `priceSatsToMcapUsd` + `formatMcapUsd` |
| Bonding curve visual | `BondingCurveVisual.tsx` | Uses `formatMcapUsd` |
| Graduation progress | `GraduationProgress.tsx` | Uses `formatMcapUsd` |
| TokenCard stats grid | `TokenCard.tsx:60-61` | Shows "MCap" via `formatUsd(token.marketCapSats, btcPrice)` |
| TokenPage stats row | `TokenPage.tsx:136` | Shows "Market Cap" via `formatUsd(token.marketCapSats, btcPrice)` |
| TrenchTokenRow | `TrenchTokenRow.tsx:68` | Shows "MC" via `formatUsd(token.marketCapSats, btcPrice)` |

### Existing MCAP utilities (ready to use)

- `priceSatsToMcapUsd(pricePerToken, btcPrice)` — converts per-token sats price to MCAP USD
- `formatMcapUsd(value)` — formats MCAP number to compact string ($855, $12.3k, $1.2M)
- `TOTAL_SUPPLY_WHOLE_TOKENS` = 1,000,000,000 (1B tokens)

## Decisions

### D1: Approach for TokenPrice component
**Decision**: Refactor `TokenPrice` to accept `priceSats` and compute MCAP internally using `priceSatsToMcapUsd`, then display via `formatMcapUsd`. Append " MCAP" label.
**Rationale**: Minimal change surface — all consumers (TokenCard, TokenPage) continue passing the same props. The component just renders differently.
**Alternative considered**: Create a new `TokenMcap` component and replace all usages. Rejected — unnecessary churn for a display-only change.

### D2: TokenList direct call
**Decision**: Replace `formatUsdPrice(token.currentPriceSats, btcPrice)` with `formatMcapUsd(priceSatsToMcapUsd(token.currentPriceSats, btcPrice))` and add " MCAP" suffix. Change column header from "Price" to "MCAP".
**Rationale**: TokenList doesn't use the TokenPrice component; it calls formatUsdPrice directly.

### D3: Duplicate MCap display in TokenCard
**Decision**: Remove the separate "MCap" stat from TokenCard's stats grid (line 60-61) since the main display now shows MCAP. Replace it with another useful stat or leave it as-is to avoid scope creep.
**Rationale**: Showing MCAP twice (main display + stats grid) is redundant. However, the spec says "replace price with MCAP" — it doesn't say "remove MCap from stats". We'll keep the stats grid as-is to avoid scope creep. The user can decide later.

### D4: MCAP label format
**Decision**: Display as `$855 MCAP` — dollar value followed by "MCAP" text label.
**Rationale**: Matches the user's example in the spec. Clear and unambiguous.

### D5: formatUsdPrice cleanup
**Decision**: Keep `formatUsdPrice` function in format.ts (don't delete it) since it may be used elsewhere or useful for future needs. Just stop calling it from display components.
**Rationale**: Avoid unnecessary cleanup in this scope.

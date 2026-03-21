# Feature Specification: Replace Token Unit Price with MCAP Display

**Feature Branch**: `15-mcap-replace-price`
**Created**: 2026-03-21
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - See MCAP instead of unit price on token cards (Priority: P1)
As a user browsing the homepage or any token listing, I see each token's market cap in USD (e.g., "$855 MCAP") instead of the per-token unit price (e.g., "$0.00000085410"). This gives me an immediate sense of the token's size and traction without needing to mentally convert tiny fractional prices.

**Why this priority**: This is the most visible change — token cards appear on the homepage (Top Tokens, Recent Tokens), profile pages (Created Tokens), and search results. Most users encounter tokens here first.

**Independent Test**: Load the homepage. Every token card should display a dollar MCAP value (e.g., "$855 MCAP") where it previously showed a per-token unit price.

**Acceptance Scenarios**:
1. **Given** a token with a current price of 85,410 sats and a total supply of 1B tokens, **When** the token card renders, **Then** I see the MCAP formatted in compact USD (e.g., "$855 MCAP") instead of the per-token price.
2. **Given** a token with a very low MCAP (< $1), **When** the card renders, **Then** I see a reasonably formatted value (e.g., "$0.42 MCAP") — not scientific notation or excessive decimals.
3. **Given** a token with a high MCAP (> $1M), **When** the card renders, **Then** I see a compact value (e.g., "$1.2M MCAP").

### User Story 2 - See MCAP on token detail page header (Priority: P1)
As a user viewing a specific token's detail page, I see the token's MCAP in USD prominently in the header area where the per-token price used to be.

**Why this priority**: The token detail page is the primary decision-making surface for trades. Showing MCAP here aligns with the card view and provides consistent information.

**Independent Test**: Navigate to any token's detail page. The header should show MCAP in USD where it previously showed the per-token price.

**Acceptance Scenarios**:
1. **Given** I am on a token detail page, **When** the page loads, **Then** the header displays the MCAP value in USD with a "MCAP" label.
2. **Given** the token's price changes (optimistic/mempool update), **When** the price updates, **Then** the displayed MCAP updates in real time.

### User Story 3 - See MCAP in token list table (Priority: P1)
As a user viewing the token list (table/trenches view), the price column shows MCAP in USD instead of per-token price.

**Why this priority**: The table view is a dense data surface; consistent MCAP display here completes the replacement across all listing views.

**Independent Test**: Navigate to the token list view. The column that previously showed unit price should now show MCAP.

**Acceptance Scenarios**:
1. **Given** the token list table is displayed, **When** I look at the price column, **Then** each row shows the token's MCAP in USD.
2. **Given** the column header previously said "Price" or similar, **When** the page renders, **Then** the column header reflects MCAP (e.g., "MCAP").

### User Story 4 - 24h price change still visible (Priority: P2)
As a user, I still see the 24-hour percentage change indicator alongside the MCAP value, so I can gauge recent momentum.

**Why this priority**: Removing the price change indicator would lose useful context. It should carry over to MCAP display since MCAP change % is the same as price change %.

**Independent Test**: Confirm that 24h change percentage badges/indicators still appear next to the MCAP values in cards, lists, and detail pages.

**Acceptance Scenarios**:
1. **Given** a token with a positive 24h price change, **When** the MCAP is displayed, **Then** a green percentage change badge appears alongside it.
2. **Given** a token with a negative 24h price change, **When** the MCAP is displayed, **Then** a red percentage change badge appears alongside it.

### Edge Cases
- What happens when BTC price data is unavailable? MCAP cannot be calculated — should show a placeholder or loading state (same behavior as current price display).
- What happens for tokens with zero or negligible supply? MCAP should display as "$0" or equivalent.
- What happens for newly created tokens with no trades yet? Display initial MCAP based on the starting bonding curve price.

## Requirements

### Functional Requirements
- **FR-001**: System MUST display market cap in USD wherever per-token unit price was previously shown (token cards, token list table, token detail page header).
- **FR-002**: System MUST format MCAP values in compact notation for readability (e.g., "$855", "$12.3K", "$1.2M").
- **FR-003**: System MUST append a "MCAP" label to the displayed value so users understand what the number represents.
- **FR-004**: System MUST continue displaying 24-hour percentage change alongside the MCAP value.
- **FR-005**: System MUST update MCAP values in real time when price data changes (mempool-first updates).
- **FR-006**: System MUST NOT change MCAP display in areas that already show MCAP correctly (chart Y-axis, bonding curve visual, graduation progress).

### Key Entities
- **Market Cap (MCAP)**: The total value of a token's supply at its current price, expressed in USD. Calculated as: token price in BTC * total supply * BTC/USD rate.
- **Token Unit Price**: The per-token price in USD — this is being REMOVED from display (replaced by MCAP).

## Success Criteria

### Measurable Outcomes
- **SC-001**: Zero locations in the UI display a per-token unit price to the user. All former price displays show MCAP instead.
- **SC-002**: All MCAP values are formatted in compact, human-readable notation (no scientific notation, no excessive decimals).
- **SC-003**: 24h change indicators remain visible and functional on all MCAP displays that previously showed them with price.
- **SC-004**: MCAP values update in real time consistent with the mempool-first architecture (no waiting for block confirmation).

## Assumptions
- MCAP calculation uses the same formula already present in the codebase (`priceSatsToMcapUsd`).
- The "MCAP" label is sufficient to communicate the metric — no tooltip or explainer needed.
- Compact formatting uses standard conventions: raw number below $1K, "K" suffix for thousands, "M" for millions.

# Feature Specification: USD Value Display on Homepage

**Feature Branch**: `3-usd-display`
**Created**: 2026-03-19
**Status**: Draft

## Context

All monetary values across the homepage are currently displayed in Bitcoin-native units (sats or BTC). Users unfamiliar with Bitcoin denominations struggle to understand the real-world value of token prices, volumes, and market caps at a glance. Displaying dollar equivalents makes the platform immediately accessible to a broader audience.

## User Scenarios & Testing

### User Story 1 — Browse Tokens with Dollar Values (Priority: P1)

A visitor lands on the homepage and sees the top tokens and recent tokens sections. Every monetary value — price, 24h volume, and market cap — is shown in US dollars so they can instantly gauge token activity in familiar terms.

**Why this priority**: This is the core ask — homepage values in dollars.

**Independent Test**: Open the homepage as a new visitor and verify every token card and token list row shows price, volume, and market cap in USD.

**Acceptance Scenarios**:
1. **Given** a token with a current price of 500 sats, **When** BTC/USD is $65,000, **Then** the price displays as approximately "$0.000325" (or an appropriately formatted small-dollar amount).
2. **Given** a token with 24h volume of 5,000,000 sats, **When** BTC/USD is $65,000, **Then** volume displays as approximately "$3,250" (or "$3.25k").
3. **Given** a token with market cap of 50,000,000 sats, **When** BTC/USD is $65,000, **Then** market cap displays as approximately "$32,500" (or "$32.5k").

### User Story 2 — Platform Stats in Dollars (Priority: P1)

A visitor sees the platform-wide "Total Volume" metric on the homepage displayed in US dollars, giving an instant sense of platform activity.

**Why this priority**: Platform stats are the first numbers users see and set the credibility tone.

**Independent Test**: Load the homepage and verify the "Total Volume" stat shows a dollar amount.

**Acceptance Scenarios**:
1. **Given** total platform volume is 100 BTC, **When** BTC/USD is $65,000, **Then** "Total Volume" displays as "$6,500,000" (or "$6.5M").
2. **Given** the BTC/USD price updates, **Then** the displayed dollar value refreshes accordingly without a page reload.

### User Story 3 — Token Detail Page Dollar Values (Priority: P2)

When a user navigates to a specific token's page, the stats grid (Volume 24h, Market Cap) and the token price header show dollar values, consistent with the homepage.

**Why this priority**: Consistency across pages; users who click through from homepage expect the same unit.

**Independent Test**: Navigate to any token detail page and verify Volume 24h, Market Cap, and the header price are in USD.

**Acceptance Scenarios**:
1. **Given** a user clicks a token from the homepage, **When** the token detail page loads, **Then** Volume 24h, Market Cap, and the header price are shown in USD.

### User Story 4 — Trenches Page Dollar Values (Priority: P2)

The Trenches (browse/filter) page displays token values in dollars when shown as a grid (cards) or table (list rows).

**Why this priority**: Consistent with homepage; same components reused.

**Independent Test**: Navigate to the Trenches page, toggle between grid and table views, and verify all monetary values are in USD.

**Acceptance Scenarios**:
1. **Given** the user opens Trenches in grid view, **Then** each token card shows price, volume, and market cap in USD.
2. **Given** the user switches to table view, **Then** the Price and Volume columns show USD values.

### User Story 5 — Trade Forms and Fee Breakdown in Dollars (Priority: P3)

When a user opens the buy or sell form, their balance is shown in USD, the fee breakdown displays in USD, and the input field accepts a dollar amount that auto-converts to BTC for the underlying transaction.

**Why this priority**: Helpful but less critical — users actively trading are more likely to understand sats.

**Independent Test**: Open a buy form for any token, enter an amount, and verify balance, output estimate, and fee breakdown display USD.

**Acceptance Scenarios**:
1. **Given** a user's wallet balance is 0.01 BTC, **When** BTC/USD is $65,000, **Then** balance shows "$650".
2. **Given** a fee breakdown totaling 15,000 sats, **Then** each fee line and the total show the dollar equivalent.

### User Story 6 — Profile Page Dollar Values (Priority: P2)

A user views their profile and sees total volume, claimable creator fees, and minter reward pool all displayed in US dollars, consistent with every other page.

**Why this priority**: Consistency — same unit everywhere, no sats remaining.

**Independent Test**: Navigate to a user profile and verify total volume, creator fees, and minter rewards are in USD.

**Acceptance Scenarios**:
1. **Given** a user's total volume is 10,000,000 sats, **When** BTC/USD is $65,000, **Then** "Total Volume" displays as "$6,500" (or "$6.5k").
2. **Given** claimable creator fees of 50,000 sats, **When** BTC/USD is $65,000, **Then** creator fees display as "$32.50".

### Edge Cases

- **BTC price unavailable**: If the dollar price feed fails or is stale, the system displays the last known cached dollar value. The old sats formatters do not need to be retained as a fallback.
- **Very small dollar amounts**: Token prices that convert to fractions of a cent (e.g., $0.0000032) must remain readable — use sufficient decimal places or scientific notation.
- **Very large dollar amounts**: Platform volume that converts to millions or billions should use abbreviated formatting ($1.2M, $3.4B).
- **Price feed latency**: The BTC/USD price may lag by seconds to minutes depending on the source. The system should display values using the most recent available price without blocking renders.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST fetch a live BTC/USD exchange rate from an external source and keep it reasonably current (within minutes).
- **FR-002**: The system MUST display token price, 24h volume, and market cap in US dollars on all token cards and token list rows on the homepage.
- **FR-003**: The system MUST display the "Total Volume" platform stat in US dollars on the homepage.
- **FR-004**: The system MUST display token price, Volume 24h, and Market Cap in US dollars on the token detail page.
- **FR-005**: The system MUST display monetary values in US dollars on the Trenches page (both grid and table views).
- **FR-006**: The system MUST format dollar amounts using standard conventions: "$" prefix, commas for thousands, and abbreviated suffixes for large values ($1.2k, $3.4M, $1.5B).
- **FR-007**: The system MUST handle very small dollar amounts (sub-cent) with enough decimal precision to be meaningful (e.g., "$0.000325").
- **FR-008**: The system MUST accept USD input in trade forms (buy/sell) and auto-convert to the equivalent BTC amount for the transaction. Balance, simulation output, and fee breakdown MUST display in USD.
- **FR-009**: The system MUST NOT block page rendering if the BTC/USD price feed is unavailable — it should degrade gracefully by showing the last cached value.
- **FR-010**: The system MUST display total volume, creator fees, and minter rewards in US dollars on the profile page.

### Key Entities

- **BTC/USD Rate**: The current exchange rate between Bitcoin and US Dollars, sourced externally and refreshed periodically.
- **Formatted Dollar Value**: A display-ready string converting a sats-denominated value to its USD equivalent using the current BTC/USD rate.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of monetary values on the homepage (token cards, token list, platform stats) display in US dollars.
- **SC-002**: Dollar values update within 5 minutes of a BTC/USD price change without requiring a page reload.
- **SC-003**: No page or component crashes or shows blank values when the BTC/USD price feed is temporarily unavailable.
- **SC-004**: Dollar formatting is consistent across all pages — same abbreviation rules, same decimal precision for equivalent magnitudes.

## Assumptions

- A free or low-cost public API is available for BTC/USD price (e.g., CoinGecko, Coinbase, Kraken).
- The BTC/USD rate does not need to be precise to the second — a refresh interval of 1–5 minutes is acceptable.
- Graduation progress bar continues to show BTC reserve vs BTC threshold (these are protocol-level values, not market values).

## Clarifications

### Session 2026-03-19

- Q: Should users have a toggle to switch between USD and sats/BTC display? → A: No — always show USD. Sats/BTC display is removed entirely. Single code path, no toggle state needed.
- Q: When the BTC/USD price feed is unavailable, what should the system display? → A: Show last known cached dollar value. No fallback to sats needed — old sats formatters can be removed.
- Q: Should trade form inputs remain in BTC or also accept USD input? → A: Allow typing USD with auto-convert to BTC. Consistent with the USD-everywhere approach.
- Q: Should profile page values (total volume, creator fees, minter rewards) also display in USD? → A: Yes — include profile page for full consistency across the app.

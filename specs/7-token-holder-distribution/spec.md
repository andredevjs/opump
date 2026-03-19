# Feature Specification: Token Holder Distribution

**Feature Branch**: `7-token-holder-distribution`
**Created**: 2026-03-19
**Status**: Draft

## Overview

Add a "Top Holders" section and total holder count to the Token Info tab on the token detail page. Users should be able to see the top holders by percentage of total supply and the total number of unique holders, giving them transparency into token ownership concentration.

## User Scenarios & Testing

### User Story 1 — View Top Holders List (Priority: P1)

As a trader evaluating a token, I want to see the top holders ranked by percentage of supply so I can assess ownership concentration and identify potential risks (e.g., a single wallet holding 80% of supply).

**Why this priority**: Holder distribution is a critical trust signal for traders. Concentrated ownership is a common rug-pull indicator — surfacing this data directly impacts user safety and trading decisions.

**Independent Test**: Navigate to any token's detail page, open the Token Info tab, and verify the top holders list is visible with addresses and percentage breakdown.

**Acceptance Scenarios**:

1. **Given** a token with multiple holders, **When** I open the Token Info tab, **Then** I see a ranked list of the top holders showing each holder's truncated address and their percentage of total supply.
2. **Given** a token with more than 10 holders, **When** I view the top holders list, **Then** only the top 10 holders are displayed, ordered from highest to lowest percentage.
3. **Given** a token with only 1 holder, **When** I view the top holders list, **Then** I see that single holder displayed at ~100%.
4. **Given** a newly created token with no trades yet, **When** I view the top holders list, **Then** I see the creator as the sole holder (if they hold creator allocation) or an empty/placeholder state if no one holds tokens.

### User Story 2 — View Holder Count in Token Info (Priority: P1)

As a user browsing a token's info, I want to see the total number of unique holders displayed alongside the other token details so I have a quick sense of the token's adoption without switching tabs or sections.

**Why this priority**: Holder count is a basic adoption metric that belongs with other token metadata. It's already tracked — just not shown in the Token Info tab.

**Independent Test**: Navigate to any token's detail page, open the Token Info tab, and verify the holder count is displayed.

**Acceptance Scenarios**:

1. **Given** a token with holders, **When** I view the Token Info tab, **Then** I see the total holder count displayed as a labeled field (e.g., "Holders: 47").
2. **Given** a token with zero holders (edge case), **When** I view the Token Info tab, **Then** the holder count displays "0".

### User Story 3 — Holder Percentage Reflects Real-Time State (Priority: P2)

As a trader monitoring a token, I want the holder distribution to update when new trades happen so I can see if ownership is shifting.

**Why this priority**: Stale data undermines trust. Since OPump is mempool-first, holder data should reflect pending transactions — not just confirmed blocks.

**Independent Test**: Open a token's Token Info tab, execute a buy from another wallet, and verify the holder list updates on the next data refresh.

**Acceptance Scenarios**:

1. **Given** I am viewing the Token Info tab for a token, **When** a new buy trade hits the mempool, **Then** the holder list and percentages update on the next polling cycle without requiring a page reload.
2. **Given** a holder sells their entire balance, **When** the sell hits the mempool, **Then** that holder is removed from the top holders list and the holder count decreases.

### Edge Cases

- What happens when the creator allocation is 100%? Only one holder exists — display accordingly.
- What happens when two holders have the exact same percentage? Display both, ordered by address or insertion order.
- What happens when a holder's balance rounds to 0.0%? Exclude from the top list or show "< 0.1%".
- What happens if the token has not been traded yet? Show the initial state (creator allocation holder or empty state).
- What happens when a token is graduated/migrated? Show last-known holder data as-is with no special treatment. The token page already indicates graduated status, so the data is implicitly historical.

## Requirements

### Functional Requirements

- **FR-001**: System MUST display a "Top Holders" section within the Token Info tab showing up to 10 holders ranked by percentage of total supply (highest first).
- **FR-002**: Each holder entry MUST display the holder's truncated address and their percentage of total supply.
- **FR-003**: System MUST display the total holder count as a labeled field in the Token Info tab.
- **FR-004**: Holder percentage MUST be calculated as `(holder balance / total supply) * 100`.
- **FR-005**: System MUST track per-holder balances (not just address presence) to compute accurate percentages.
- **FR-006**: Holder data MUST update from mempool events consistent with the mempool-first architecture — not gated behind block confirmations.
- **FR-007**: System MUST handle the zero-holders and single-holder states gracefully with appropriate UI.
- **FR-008**: Holder addresses MUST be truncated for display (e.g., `bc1q...x4f9`) but allow copy-to-clipboard on click.

### Key Entities

- **Holder**: A unique address that owns a non-zero balance of a specific token. Key attributes: address, balance, percentage of supply.
- **Holder Distribution**: The ranked list of top holders for a given token, derived from per-holder balance tracking.

## Success Criteria

### Measurable Outcomes

- **SC-001**: 100% of token detail pages display the top holders list and holder count in the Token Info tab.
- **SC-002**: Holder percentages sum to ≤ 100% (top 10 may not account for all supply).
- **SC-003**: Holder data refreshes within the same polling interval as other token data (no additional delay).
- **SC-004**: Users can identify ownership concentration at a glance — a single dominant holder is immediately obvious from the percentage display.

## Assumptions

- The system can derive per-holder balances from trade history (buys add to balance, sells subtract). Currently only holder *presence* is tracked (Redis set), so balance tracking is a new capability.
- The creator allocation is treated as the initial balance for the creator address.
- "Total supply" for percentage calculation refers to the circulating supply (tokens actually purchased/distributed to holders), not the maximum possible supply. This ensures percentages reflect real ownership concentration among active participants.
- Top holders list is a simple text-only list: percentage + truncated address, ordered by largest holder first. No visual bars or charts.
- All holders are displayed identically — no special labels for the creator or any other address.

## Clarifications

### Session 2026-03-19

- Q: Should the top holders list show visual bars alongside percentages? → A: No — simple text-only list with percentage + truncated address, ordered largest first.
- Q: Should the creator's address be labeled as "Creator" in the list? → A: No — all holders displayed identically, no special labels.
- Q: Does "total supply" mean max supply or circulating supply for percentage calc? → A: Circulating supply (tokens actually distributed to holders).
- Q: What happens to the holder list for graduated/migrated tokens? → A: Show last-known data as-is, no special treatment.

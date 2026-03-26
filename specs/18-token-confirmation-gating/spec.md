# Feature Specification: Token Confirmation Gating

**Feature Branch**: `18-token-confirmation-gating`
**Created**: 2026-03-26
**Status**: Draft

## Problem

When a user deploys a token, the deploy and register transactions are broadcast to the Bitcoin mempool but take ~10 minutes (or longer) to confirm in a block. Today the UI immediately shows "Token Deployed!" and lets the user navigate to the token page, but:

1. The token detail page shows buy/sell forms even though the contract isn't confirmed yet — trades would fail.
2. The deploy success screen is misleading: the token is broadcast, not deployed.
3. Other users browsing the Fields page can see an unconfirmed token with no indication it's still pending.
4. The backend saves the token to Redis optimistically (before the RPC can verify the deploy TX), so there is no on-chain confirmation signal stored.

## User Scenarios & Testing

### User Story 1 — Creator waits for confirmation after deploy (Priority: P1)

After broadcasting the deploy + register transactions, the creator sees a "Waiting for confirmation" step instead of a premature success screen. This step polls until the deploy TX is confirmed on-chain, then shows the real success message.

**Why this priority**: Without this, the creator thinks the token is live and navigates to a broken token page.

**Independent Test**: Deploy a token on testnet. After Phase 3 completes, verify the UI shows a waiting/polling state. Wait for the next block. Verify the UI transitions to the success state once confirmed.

**Acceptance Scenarios**:
1. **Given** all 3 deploy phases complete, **When** the deploy TX is still in the mempool, **Then** the UI shows a 4th phase: "Waiting for on-chain confirmation" with a spinner and estimated wait time.
2. **Given** the confirmation step is active, **When** the deploy TX is included in a block, **Then** the UI transitions to the success screen ("Token Deployed!") and the "View Token" button becomes available.
3. **Given** the confirmation step is active, **Then** a "View Token (Pending)" link is available so the creator can navigate to the token detail page without waiting. The token page shows the pending state.
4. **Given** the confirmation step is active, **When** the user closes the page and returns later, **Then** the token page shows the correct status (pending or confirmed) based on current chain state.

### User Story 2 — Unconfirmed tokens are visible but non-tradeable (Priority: P1)

Tokens that have been registered in the backend but not yet confirmed on-chain appear in the Fields page and token detail page with a "Pending" indicator. Buy/sell forms are hidden for unconfirmed tokens.

**Why this priority**: Allowing trades against an unconfirmed contract would result in failed transactions and lost fees.

**Independent Test**: Deploy a token. Before the block confirms, open the Fields page in another browser. Verify the token appears with a "Pending" badge. Click into it. Verify buy/sell forms are replaced with a "Waiting for confirmation" message.

**Acceptance Scenarios**:
1. **Given** a token is saved with `deployBlock: 0` (unverified), **When** it appears on the Fields page, **Then** it shows a visible "Pending" badge/indicator distinct from the "Active" state.
2. **Given** a user navigates to an unconfirmed token's detail page, **When** the page loads, **Then** the trade panel is replaced with a message indicating the token is awaiting confirmation. Chart and info tabs are still visible.
3. **Given** an unconfirmed token, **When** the indexer processes the block containing the deploy TX, **Then** the token status updates to confirmed/active and trading becomes available without a page refresh (via polling).

### User Story 3 — Backend rejects trades on unconfirmed tokens (Priority: P1)

Even if a user bypasses the frontend gating, the backend refuses to accept trade submissions for tokens that are not yet confirmed on-chain.

**Why this priority**: Defense-in-depth — frontend gating alone is insufficient.

**Independent Test**: Use curl/API to submit a trade against a token with `deployBlock: 0`. Verify the API returns an error.

**Acceptance Scenarios**:
1. **Given** a trade submission for a token with `deployBlock: 0`, **When** the backend processes it, **Then** it returns an error indicating the token is not yet confirmed.

### User Story 4 — Confirmation updates token status automatically (Priority: P2)

When the indexer processes a block containing the token's deploy transaction, it updates the token record from unconfirmed (`deployBlock: 0`) to confirmed (with the actual block number).

**Why this priority**: This is the mechanism that transitions tokens from pending to tradeable.

**Independent Test**: Deploy a token. Verify `deployBlock` is 0 in Redis. Wait for block confirmation. Trigger the indexer. Verify `deployBlock` is now set to the actual block number.

**Acceptance Scenarios**:
1. **Given** a token with `deployBlock: 0` in Redis, **When** the indexer processes the block containing the deploy TX, **Then** the token's `deployBlock` is updated to the actual block number.
2. **Given** the indexer updates `deployBlock`, **When** the frontend polls for token data, **Then** the token transitions from "Pending" to "Active" and trading becomes available.

### Edge Cases

- What happens if the deploy TX is dropped from the mempool (e.g., low fee, replaced)? Token stays in "Pending" state indefinitely. A future cleanup job could expire tokens that remain unconfirmed beyond a threshold (out of scope for this feature).
- What happens if the user deploys and immediately navigates to the token page via URL? The page should check confirmation status and show the pending state.
- What happens if the creator navigates away during the confirmation wait and comes back? The token page shows the correct current state (pending or active).
- What happens if two users try to trade an unconfirmed token simultaneously? Both are blocked — the backend rejects all trades for unconfirmed tokens.

## Requirements

### Functional Requirements

- **FR-001**: The deploy flow MUST include a confirmation-waiting phase (Phase 4) after metadata saving that polls until the deploy TX is confirmed. The creator MAY navigate away via a "View Token (Pending)" link; if they stay, Phase 4 transitions to the success screen on confirmation.
- **FR-002**: Tokens with `deployBlock: 0` MUST display a "Pending" status indicator on all pages (Fields, token detail, profile).
- **FR-003**: The trade panel MUST be hidden for tokens with `deployBlock: 0`, replaced with a message indicating the token is awaiting confirmation.
- **FR-004**: The backend MUST reject trade submissions for tokens with `deployBlock: 0`.
- **FR-005**: The indexer MUST update `deployBlock` from 0 to the actual block number when it processes the deploy TX.
- **FR-006**: The token detail page MUST poll for status changes so that the "Pending" state transitions to "Active" without requiring a page refresh.
- **FR-007**: The deploy confirmation step MUST show estimated wait time context (e.g., "Bitcoin blocks take ~10 minutes").

### Key Entities

- **TokenDocument**: Existing entity. `deployBlock: 0` signals unconfirmed; `deployBlock: N > 0` signals confirmed at block N.
- **TokenStatus**: Existing type (`active | graduated | migrating | migrated | new`). The "pending" state is derived from `deployBlock === 0`, not a separate status value — this avoids adding migration complexity to the status enum.

## Assumptions

- The `deployBlock: 0` convention (already in place from the optimistic save) is the source of truth for confirmation status. No new database fields are needed.
- The indexer already processes deployment transactions and can update `deployBlock` as part of its existing block-processing loop.
- The frontend already polls token data periodically (Fields page polls every 5 seconds). Token detail page will need polling added or extended.

## Clarifications

### Session 2026-03-26

- Q: Should the creator be forced to stay on the deploy page during confirmation wait? → A: No — creator can navigate away via a "View Token (Pending)" link. If they stay, Phase 4 transitions to success on confirmation.
- Q: Should pending tokens appear on the Fields discovery page? → A: Yes — show with a "Pending" badge in the New column. Consistent with mempool-first.
- Q: What happens if confirmation takes longer than ~30 minutes? → A: Keep polling indefinitely. No timeout. Token stays "Pending" in DB until confirmed. Cleanup of permanently stuck tokens deferred to a future feature.

## Success Criteria

### Measurable Outcomes

- **SC-001**: After deploying a token, the creator never sees the success screen until the deploy TX is confirmed on-chain.
- **SC-002**: Zero trade submissions are accepted for tokens with `deployBlock: 0`.
- **SC-003**: Unconfirmed tokens display a distinct visual indicator on every page where they appear.
- **SC-004**: Within one polling interval of block confirmation, the token transitions from pending to active in the UI without a page refresh.

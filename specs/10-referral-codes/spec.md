# Feature Specification: Referral Code System

**Feature Branch**: `10-referral-codes`
**Created**: 2026-03-19
**Status**: Draft

## Context

OPump ran a pre-launch campaign that onboarded ~200 people. Each of these users should receive a referral code. When someone they refer trades on the platform, the referrer earns a percentage of the platform fee from that trade. This incentivizes word-of-mouth growth and rewards early community members.

The referral reward comes from the platform's existing 1% fee — it is NOT an additional fee charged to traders. Traders pay the same 1.25% regardless of whether they were referred.

## User Scenarios & Testing

### User Story 1 — Referrer Shares Their Code (Priority: P1)
A referrer visits their referral dashboard, sees their unique code, and copies a shareable link (e.g., `opump.io/?ref=CODE`). They share this link with friends.
**Why this priority**: Without codes and shareable links, the whole system is blocked.
**Independent Test**: A user with a referral code logs in, navigates to a referral section, and copies their link.
**Acceptance Scenarios**:
1. **Given** a user whose wallet address has a referral code assigned, **When** they connect their wallet and view the referral section, **Then** they see their unique code and a copyable share link.
2. **Given** a user whose wallet address has NO referral code, **When** they view the referral section, **Then** they see nothing (or a message explaining they don't have a code).

### User Story 2 — Referred User Lands with a Code (Priority: P1)
A new user clicks a referral link (`?ref=CODE`). The code is remembered. When they connect their wallet and make their first trade, their wallet is permanently linked to that referral code.
**Why this priority**: This is the core tracking mechanism — without it, referrals can't be attributed.
**Independent Test**: Open the app with `?ref=TESTCODE` in the URL, connect a wallet, execute a trade, and verify the wallet is linked to that code in the backend.
**Acceptance Scenarios**:
1. **Given** a user visits with `?ref=CODE` in the URL, **When** the page loads, **Then** the referral code is persisted locally (survives page refresh).
2. **Given** a user with a locally stored referral code, **When** they connect their wallet, **Then** the backend links that wallet address to the referral code.
3. **Given** a wallet already linked to a referral code, **When** the same user visits with a different `?ref=` code, **Then** the original referral link is NOT overwritten (first-touch attribution).
4. **Given** a referrer tries to use their own referral code, **When** their wallet is the same as the referrer's wallet, **Then** the self-referral is rejected.

### User Story 3 — Referrer Earns from Referred Trades (Priority: P1)
When a referred user trades (buy or sell), the referrer earns a percentage of the platform fee collected on that trade. Earnings accumulate and are visible on the referrer's dashboard.
**Why this priority**: This is the incentive — without earnings, the system has no value.
**Independent Test**: A referred user executes a trade. Check that the referrer's accumulated earnings increase by the correct amount.
**Acceptance Scenarios**:
1. **Given** User B was referred by User A, **When** User B executes a buy trade, **Then** User A's referral earnings increase by the referral percentage of the platform fee on that trade.
2. **Given** User A has accumulated referral earnings, **When** User A views their referral dashboard, **Then** they see total earnings, number of referred users, and number of trades by referred users.

### User Story 4 — Bulk Code Creation (Priority: P1)
An admin can create referral codes in bulk — either by providing a list of wallet addresses (from the pre-launch campaign) or by generating a batch of unassigned codes that can later be claimed.
**Why this priority**: ~200 existing users need codes immediately.
**Independent Test**: Submit a list of 200 wallet addresses; verify 200 unique codes are created and associated.
**Acceptance Scenarios**:
1. **Given** an admin with a list of wallet addresses, **When** they submit the list, **Then** each address gets a unique referral code.
2. **Given** a wallet address that already has a code, **When** it appears in a bulk import, **Then** the existing code is preserved (no duplicates).

### Edge Cases
- A user visits with `?ref=INVALID_CODE` — the invalid code is silently ignored, no error shown.
- A referrer refers themselves — self-referral is rejected at linking time.
- A referred user makes many trades — each trade generates referral earnings for the referrer.
- A wallet that was referred later gets its own referral code — both relationships coexist (they can be a referrer AND a referred user).
- Referral codes should be short, URL-safe, and case-insensitive (e.g., 6-8 alphanumeric characters).

## Requirements

### Functional Requirements
- **FR-001**: Each referral code MUST be unique and linked to exactly one referrer wallet address.
- **FR-002**: A referred wallet MUST be permanently linked to exactly one referral code (first-touch, immutable).
- **FR-003**: Referral earnings MUST be calculated as a percentage of the platform fee (1%) on each trade by a referred user.
- **FR-004**: Referral earnings MUST accumulate per referrer and be queryable.
- **FR-005**: The referral code MUST persist across browser sessions (survive refresh/close).
- **FR-006**: Self-referrals (referrer wallet = referred wallet) MUST be rejected.
- **FR-007**: The system MUST support bulk creation of codes for ~200 wallet addresses.
- **FR-008**: Traders MUST NOT pay any additional fees due to the referral system — the referral reward comes from the platform's existing cut.

### Key Entities
- **Referral Code**: A short unique string (6-8 chars) linked to a referrer wallet address.
- **Referral Link**: A wallet-to-code association created when a referred user connects their wallet.
- **Referral Earnings**: Accumulated platform fee share owed to a referrer from trades by their referred users.

**Decision — Referral percentage**: 10% of the platform fee (0.1% of trade value). Platform keeps 0.9%.

**Decision — Payout mechanism**: Off-chain tracking (Redis), no automated payout. Earnings are tracked and displayed but payouts are handled manually by the platform team. On-chain claim can be added later.

## Assumptions
- Referral codes are assigned to wallet addresses, not to user accounts (OPump has no account system).
- The ~200 pre-launch users will be imported via a one-time bulk operation (list of wallet addresses provided by the team).
- No contract changes needed — referral tracking and earnings calculation happen at the application layer.
- Referral earnings are denominated in sats (matching the trade fee denomination).

## Success Criteria

### Measurable Outcomes
- **SC-001**: 200 referral codes created and linked to pre-launch wallet addresses.
- **SC-002**: Referred users' trades correctly attribute earnings to the referrer within 1 second of trade submission (mempool-first).
- **SC-003**: Referrer dashboard displays accurate total earnings, referral count, and trade count.
- **SC-004**: Zero additional fees charged to any trader due to the referral system.
- **SC-005**: Referral code persists across browser sessions with >99% reliability.

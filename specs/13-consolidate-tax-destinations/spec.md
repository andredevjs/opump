# Feature Specification: Consolidate Flywheel Tax Destinations

**Feature Branch**: `13-consolidate-tax-destinations`
**Created**: 2026-03-20
**Status**: Draft

## Background

The Flywheel Tax feature allows token creators to set a buy/sell tax with a configurable destination. Currently, three destinations are presented to the user:

1. **Burn** (dest=0) — Removes sats from the bonding curve, reducing effective supply
2. **Creator Pool** (dest=1) — Adds tax to a claimable creator fee pool
3. **Creator Wallet** (dest=2) — Described as "Direct to you", but in the contract it also adds to the same claimable creator fee pool

Destinations 1 and 2 are functionally identical in the smart contract — both call `creatorFeePool.set(SafeMath.add(creatorFeePool.value, flywheelFee))`. This creates user confusion by presenting two options that behave the same way.

## User Scenarios & Testing

### User Story 1 - Creator selects tax destination (Priority: P1)
As a token creator configuring the Flywheel Tax, I see only two clear destination options (Burn or Creator) so I can make an informed choice without confusion.
**Why this priority**: Directly eliminates the UX confusion caused by duplicate options.
**Independent Test**: Navigate to the Flywheel Tax step during token launch, enable tax, and verify only two destination options appear.
**Acceptance Scenarios**:
1. **Given** a creator is on the Flywheel Tax configuration step, **When** they enable the tax, **Then** they see exactly two destination options: "Burn" and "Creator"
2. **Given** a creator selects the "Creator" destination, **When** the token is deployed, **Then** the contract receives destination value `1` (community_pool)
3. **Given** a creator selects the "Burn" destination, **When** the token is deployed, **Then** the contract receives destination value `0` (burn)

### User Story 2 - Existing tokens unaffected (Priority: P1)
Tokens already deployed with destination=2 (creator_wallet) continue to function identically since the contract handles both values the same way.
**Why this priority**: No data migration or contract changes needed — this is frontend-only.
**Independent Test**: Verify that previously deployed tokens with dest=2 still accumulate and allow claiming from the creator fee pool.
**Acceptance Scenarios**:
1. **Given** an existing token deployed with destination=2, **When** a trade occurs, **Then** the flywheel tax is still added to the creator fee pool as before

### Edge Cases
- What happens if a token was deployed with dest=2? Nothing changes — the contract still works, this is purely a frontend cleanup.
- No contract changes are needed since dest=1 and dest=2 are already identical in behavior.

## Requirements

### Functional Requirements
- **FR-001**: The Flywheel Tax configuration MUST present exactly two destination options: "Burn" and "Creator"
- **FR-002**: The "Creator" option MUST map to contract destination value `1`
- **FR-003**: The `TaxDestination` type MUST be simplified to only `'burn' | 'creator'`
- **FR-004**: The deployment step MUST map the simplified type to the correct contract values
- **FR-005**: No smart contract changes are required

### Key Entities
- **TaxDestination**: The destination for flywheel tax revenue. Simplified from three options to two: `burn` (tokens removed from supply) and `creator` (sats added to claimable creator fee pool)

## Success Criteria

### Measurable Outcomes
- **SC-001**: Only two tax destination options are visible in the launch flow UI
- **SC-002**: Token deployment with "Creator" destination sends dest=1 to the contract
- **SC-003**: Token deployment with "Burn" destination sends dest=0 to the contract
- **SC-004**: Build compiles without errors after type changes
- **SC-005**: No contract redeployment needed

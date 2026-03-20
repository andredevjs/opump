# Feature Specification: Remove Minter Fee from Fee Structure

**Feature Branch**: `9-remove-minter-fee`
**Created**: 2026-03-19
**Status**: Draft

## Context

The minter fee (0.25% of every trade, allocated to early buyers) was designed as an incentive mechanism but cannot be supported yet. Rather than just hiding the UI (branch 8), we are removing the fee entirely from the contract, backend, and frontend. The total trade fee drops from 1.5% to 1.25%.

This requires recompiling and redeploying the LaunchToken contract. Existing deployed tokens on-chain will retain the old fee structure — this change only affects newly deployed tokens going forward.

## User Scenarios & Testing

### User Story 1 — Trades Use the New 1.25% Fee (Priority: P1)
As a user buying or selling tokens on a newly deployed token, I pay a 1.25% total fee (1% platform + 0.25% creator), with no minter fee component.
**Why this priority**: The fee structure is the core change — everything else follows from it.
**Independent Test**: Deploy a new token, execute a buy, and verify the fee deducted matches 1.25% of the trade amount split into exactly two buckets (platform and creator).
**Acceptance Scenarios**:
1. **Given** a newly deployed LaunchToken, **When** a user buys tokens, **Then** the total fee is 1.25% (125 bps), split as 1% platform and 0.25% creator.
2. **Given** a newly deployed LaunchToken, **When** a user sells tokens, **Then** the same 1.25% fee applies with the same split.
3. **Given** a newly deployed LaunchToken, **When** any trade occurs, **Then** no minter fee pool balance accumulates.

### User Story 2 — No Minter Reward Claiming (Priority: P1)
As a user interacting with a newly deployed token, there is no minter reward claim functionality available.
**Why this priority**: Dead code paths in the contract waste gas and create confusion.
**Independent Test**: Attempt to call the minter reward claim function on a new token — it should not exist or should revert.
**Acceptance Scenarios**:
1. **Given** a newly deployed LaunchToken, **When** a user attempts to claim minter rewards, **Then** the call reverts or the method does not exist.
2. **Given** the contract ABI, **When** inspected, **Then** there are no `claimMinterReward` or `getMinterInfo` methods.

### User Story 3 — Fee Display Shows 1.25% Breakdown (Priority: P2)
As a user viewing fee information anywhere in the app, I see a 1.25% total fee split into platform (1%) and creator (0.25%) — no minter pool mentioned.
**Why this priority**: UI must match the actual on-chain fee structure.
**Independent Test**: View the buy/sell confirmation, homepage fee transparency section, and verify only two fee lines appear.
**Acceptance Scenarios**:
1. **Given** a user previews a trade, **When** the fee breakdown renders, **Then** it shows only "Platform 1%" and "Creator 0.25%" totaling 1.25%.
2. **Given** a user visits the homepage, **When** the transparent fees section renders, **Then** it shows two fee cards (Platform and Creator) with no minter pool card.

### User Story 4 — Flywheel Tax Destination (Priority: P2)
Tokens with a flywheel tax currently route the tax to the minter fee pool as a fallback. With the minter pool removed, the flywheel tax needs an alternative destination.
**Why this priority**: Without a destination, flywheel taxes would be lost or cause a revert.
**Independent Test**: Deploy a token with a flywheel tax enabled, execute a trade, and verify the flywheel tax routes to the correct destination.
**Acceptance Scenarios**:
1. **Given** a token with flywheel tax enabled, **When** a trade occurs, **Then** the flywheel tax is routed to the platform fee pool (or burned, per chosen option).

**Decision**: Flywheel tax routes to the creator fee pool.

### Edge Cases
- Existing deployed tokens on-chain retain the old 1.5% fee with minter pool — they are not affected.
- The `getFeePools` contract method should return only `platformFees` and `creatorFees` (no `minterFees` field).
- Backend fee simulation must match the new contract math exactly — any drift causes incorrect trade previews.
- Shared constants must stay in sync across contract, backend, and frontend.

## Requirements

### Functional Requirements
- **FR-001**: Total trade fee MUST be 1.25% (125 bps) on newly deployed tokens.
- **FR-002**: Fee split MUST be platform 1% (100 bps) + creator 0.25% (25 bps).
- **FR-003**: No minter fee pool MUST exist in the new contract.
- **FR-004**: `claimMinterReward` and `getMinterInfo` methods MUST be removed from the contract.
- **FR-005**: `getFeePools` MUST return only `platformFees` and `creatorFees`.
- **FR-006**: Frontend MUST NOT display any minter fee references.
- **FR-007**: Backend fee simulation MUST calculate fees using the new 1.25% structure.
- **FR-008**: Flywheel tax MUST route to a valid destination (see clarification above).
- **FR-009**: All existing contract tests MUST be updated to reflect the new fee structure.

### Key Entities
- **Fee Structure**: Platform (100 bps) + Creator (25 bps) = Total (125 bps). No minter component.
- **LaunchToken Contract**: The bonding curve token contract — requires recompilation and redeployment.

## Assumptions
- Only newly deployed tokens are affected. Existing on-chain tokens keep the old fee structure.
- The contract WASM will be recompiled and redeployed to testnet/mainnet.
- Branch 8 (UI-only minter card removal) will be superseded by this branch.

## Success Criteria

### Measurable Outcomes
- **SC-001**: New LaunchToken contract compiles with zero minter fee references in logic.
- **SC-002**: Contract tests pass with 1.25% total fee and two-way split.
- **SC-003**: Backend fee simulations match contract math (125 bps total).
- **SC-004**: Frontend displays only Platform and Creator fees totaling 1.25%.
- **SC-005**: No `minter`, `MinterReward`, or `minterFeePool` references remain in active code paths (ABI, contract, backend, frontend).

# Feature Specification: Fix Contract Artifact Drift

**Feature Branch**: `20-fix-artifact-drift`
**Created**: 2026-04-02
**Status**: Draft

## Problem Statement

The application deploys tokens using a stale WASM bytecode that does not match the current contract source code. Additionally, three independent math engines (deployed WASM, frontend local math, backend local math) compute price/reserves differently, and the frontend ABI still describes an old reserve model. Together these cause:

- Tokens deployed on-chain execute a different bonding curve than the one the UI assumes
- Optimistic price/MCAP shown after a trade reflects the current source math (~5.2x higher than the deployed contract)
- When confirmed state reconciles from chain, price snaps down to the actual (old) curve values, producing fake red candles and phantom negative PnL

## User Scenarios & Testing

### User Story 1 — Deployed bytecode matches current contract source (Priority: P1)

A token creator launches a new token. The WASM bytecode deployed on-chain is identical to a deterministic build of the current contract source. There is no possibility of deploying a stale artifact.

**Why this priority**: This is the root cause. Every other symptom — wrong prices, fake candles, ABI mismatches — flows from deploying outdated bytecode.

**Independent Test**: Build `LaunchToken.wasm` from source, compute its SHA-256, then compare it with the exact artifact the frontend would fetch and deploy for the same build. They must be identical byte-for-byte.

**Acceptance Scenarios**:
1. **Given** the contract source has changed, **When** the frontend build runs, **Then** the deploy artifact is rebuilt from current source automatically — no manual copy step required.
2. **Given** a developer modifies contract source and runs the frontend dev server, **When** they attempt to deploy a token, **Then** the WASM served is the freshly built artifact, not a checked-in snapshot or cached/stale copy.
3. **Given** a browser or CDN has cached a previous WASM, **When** a new contract build is produced, **Then** the frontend resolves a content-addressed/versioned artifact or rejects the stale file via checksum validation before deployment.
4. **Given** a CI/CD pipeline builds and deploys the frontend, **When** the pipeline completes, **Then** the exact WASM artifact selected by the frontend deploy flow matches a fresh contract build from the same pipeline run.

### User Story 2 — Single source of truth for price math (Priority: P1)

A trader buys tokens on a bonding curve. The price, MCAP, and reserve values shown in the UI — both optimistically (pending) and after confirmation — come from one authoritative math model that matches what the deployed contract actually executes.

**Why this priority**: Three divergent math engines mean the user sees different numbers at different times, eroding trust and making PnL unreliable.

**Independent Test**: Execute a buy, record the optimistic price shown immediately, then record the price after confirmation. They must be identical (within rounding tolerance of < 0.01%). Separately, run deterministic conformance tests proving the frontend/backend-consumable math implementation matches contract semantics, including rounding.

**Acceptance Scenarios**:
1. **Given** a user submits a buy, **When** the optimistic (pending) trade is displayed, **Then** the price/MCAP shown is derived from math with the same formulas and rounding behavior the on-chain contract will execute.
2. **Given** a pending trade is displayed, **When** the transaction confirms, **Then** the price/MCAP does not change (no snap, no fake candle).
3. **Given** the bonding curve formula changes in the contract source, **When** the frontend and backend are redeployed, **Then** the generated/shared JS-consumable math artifact is regenerated or updated in lockstep and all consumers produce identical results for the same inputs.
4. **Given** the curve math changes, **When** CI runs, **Then** canonical cross-layer test vectors for the current curve model pass and stale legacy vectors are updated or removed.

### User Story 3 — Frontend ABI matches deployed contract (Priority: P1)

A developer or the runtime calls `getReserves` or any other contract method. The ABI used by the frontend accurately describes the fields the deployed contract returns.

**Why this priority**: A mismatched ABI causes silent data misinterpretation — fields map to wrong values — which compounds the price drift problem.

**Independent Test**: Compare every method signature and return type in the ABI consumed by the frontend against the generated ABI from the current contract source. They must be structurally identical.

**Acceptance Scenarios**:
1. **Given** the contract ABI is regenerated from source, **When** the frontend-consumed ABI artifact is compared against it, **Then** they are structurally identical and derived from the same source of generation.
2. **Given** a developer changes a contract method signature, **When** the frontend build runs, **Then** the frontend ABI is regenerated automatically or the build fails with a clear error if out of sync.
3. **Given** ABI drift would require maintaining a handwritten duplicate in the frontend, **When** the build pipeline runs, **Then** that duplicate is disallowed or overwritten by generation.

### User Story 4 — Confirmation reconciliation preserves optimistic price (Priority: P2)

When the indexer processes a confirmed transaction, it does not overwrite the already-correct optimistic price/reserves with values recomputed from a mismatched source.

**Why this priority**: Even after artifacts are synced, the reconciliation path must be verified to not introduce its own drift.

**Independent Test**: Deploy a token with synced artifacts, execute a buy, wait for confirmation, verify the price in Redis before and after confirmation is identical.

**Acceptance Scenarios**:
1. **Given** a trade was optimistically recorded with correct reserves, **When** the indexer confirms the transaction, **Then** the stored price/reserves do not change.
2. **Given** the on-chain confirmed reserves differ from the optimistic reserves (e.g., due to a concurrent trade), **When** the indexer reconciles, **Then** it adopts the on-chain values (chain is authoritative for conflicts).

### Edge Cases

- What happens if a token was deployed with the old WASM before this fix? Previously deployed tokens continue to operate on their deployed bytecode. No migration is required and no on-chain behavior may be broken. Accuracy guarantees in this spec apply only to newly deployed tokens; old tokens may still show inaccurate UI numbers, which is accepted and out of scope.
- What happens if the contract build is non-deterministic (e.g., different compiler versions produce different WASM)? The build must be pinned to a specific compiler version to guarantee determinism.
- What happens if the frontend is deployed but the backend still runs old math? Both must be deployed atomically or both must consume the same generated/shared math artifact version proven equivalent to contract semantics.
- What happens if a browser, service worker, or CDN caches an old `/contracts/LaunchToken.wasm`? The deploy flow must use a content-addressed/versioned artifact or verify the artifact checksum before deployment so stale bytes cannot be used.
- What happens if old constant-product fixtures or ABI snapshots remain in the repo after the curve change? CI must fail until legacy fixtures are updated, removed, or clearly isolated from the current contract model.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST guarantee that the WASM artifact used for token deployment is built from the current contract source, not a manually copied snapshot.
- **FR-002**: The system MUST use a single canonical bonding curve definition whose semantics are defined by the contract source and whose frontend/backend-consumable implementation is generated or maintained in lockstep with the contract. Direct frontend/backend imports of AssemblyScript contract files are not required.
- **FR-003**: The frontend ABI MUST match the deployed contract's ABI at all times; the frontend must consume a generated ABI artifact or fail the build if out of sync. Handwritten duplicate ABI definitions are not an acceptable steady state.
- **FR-004**: The optimistic price/MCAP shown after a trade MUST not change when the transaction confirms, unless a conflicting concurrent trade was processed (in which case chain state is authoritative).
- **FR-005**: The system MUST NOT require a manual step (e.g., `npm run copy:wasm`) to synchronize artifacts between the contract and frontend builds.
- **FR-006**: Tokens deployed before this fix MUST continue to function on-chain with no migration or breaking change. Accurate pricing/ABI guarantees in this spec apply only to tokens deployed after the fix.
- **FR-007**: The build/deploy pipeline MUST prevent stale cached WASM from being deployed by using content-addressed/versioned artifact resolution, checksum validation, or an equivalent mechanism.
- **FR-008**: Cross-layer conformance tests MUST verify that contract behavior, backend math, and frontend-consumable math agree on canonical current-curve test vectors, including rounding behavior.
- **FR-009**: Legacy constant-product fixtures, stale ABI snapshots, or other artifacts from superseded curve models MUST be updated, removed, or isolated so they cannot silently validate the wrong behavior.

### Key Entities

- **Deploy Artifact** (LaunchToken.wasm): The compiled bytecode deployed on-chain for each new token. Must be a build output, not a checked-in snapshot.
- **Contract ABI**: The method signatures and return types describing the deployed contract's interface. Must be generated from the contract source and consumed by the frontend via generated artifacts rather than handwritten duplicates.
- **Bonding Curve Math**: The formula computing price, reserves, and MCAP from supply/reserve inputs. Contract source defines the canonical semantics; frontend/backend consume a JS/TS-usable artifact proven equivalent by conformance tests.
- **Optimistic Trade State**: The price, reserves, and MCAP stored in Redis immediately after a trade is submitted (mempool-first). Must match what the chain will compute.

## Success Criteria

### Measurable Outcomes

- **SC-001**: In CI, the SHA-256 of the exact WASM file the frontend would fetch and deploy matches a fresh build from the current contract source for the same commit/pipeline run.
- **SC-002**: For any trade on a newly deployed token, the absolute difference between optimistic price and confirmed price is < 0.01% (attributable only to rounding).
- **SC-003**: Zero instances of price "snapping" on confirmation for tokens deployed after this fix (no fake red candles, no phantom PnL).
- **SC-004**: The ABI consumed by the frontend is generated from the same source as the contract ABI and remains structurally identical after every build.
- **SC-005**: No manual artifact-copy commands exist in the developer workflow — build scripts handle synchronization end-to-end.
- **SC-006**: CI and/or build verification proves that stale cached WASM cannot be selected by the deploy flow for newly built releases.
- **SC-007**: Canonical current-curve conformance tests pass across contract, backend, and frontend-consumable math; stale legacy fixtures do not participate in validating the current curve.

## Clarifications

### Session 2026-04-02

- Q: Should the UI detect pre-fix tokens (old curve) and apply legacy math? → A: No legacy-math UI support is required. Old tokens remain accessible with no migration, but the accuracy guarantees in this spec apply only to newly deployed tokens. Inaccurate display for old tokens is accepted.
- Q: Where should the single shared bonding curve math live? → A: Contract source defines the canonical semantics. Frontend and backend consume a generated or separately maintained JS/TS-usable artifact that is proven equivalent by conformance tests. Direct imports of AssemblyScript contract files are not required.
- Q: How do we prevent browsers/CDNs from serving stale WASM for deployment? → A: The deploy flow must use a content-addressed/versioned artifact or checksum validation so an old cached `/contracts/LaunchToken.wasm` cannot be deployed silently.
- Q: How should ABI drift be prevented long-term? → A: Frontend ABI consumption must come from generated artifacts or a build-time sync step that fails closed. Handwritten duplicate ABI definitions are not the target architecture.
- Q: What happens to stale cross-layer fixtures from the old reserve model? → A: They must be updated, removed, or isolated so current-curve CI coverage cannot accidentally pass against obsolete assumptions.
- Q: What should happen to existing Redis data for tokens deployed with the old WASM? → A: Leave as-is. No migration. Active old tokens self-heal via chain reconciliation; inactive ones keep stale data (accepted).

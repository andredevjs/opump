# Tasks: Remove Minter Fee

**Branch**: `9-remove-minter-fee`
**Generated**: 2026-03-19
**Total Tasks**: 38

---

## Phase 1: Foundational — Shared Constants & Types

**Goal**: Update the shared foundation that all layers depend on.

- [x] T001 [P] Edit `shared/constants/bonding-curve.ts` — remove `MINTER_FEE_BPS`, `MINTER_WINDOW_BLOCKS`, `MINTER_HOLD_BLOCKS` exports; change `TOTAL_FEE_BPS` from `150n` to `125n` and comment from `1.5%` to `1.25%`
- [x] T002 [P] Edit `shared/types/trade.ts` — remove `minter: string` field from `TradeFees` interface
- [x] T003 [P] Edit `shared/types/api.ts` — remove `minter: string` field from `SimulationFees` interface

## Phase 2: US1+US2 — Contract Fee Logic & Minter Removal (P1)

**Goal**: Remove the minter fee from the contract's fee math, storage, and public methods. This is the source of truth.

**Depends on**: Phase 1

### Constants & BondingCurve

- [x] T004 Edit `contracts/src/lib/Constants.ts` — remove `MINTER_FEE_BPS`, `MINTER_WINDOW_BLOCKS`, `MINTER_HOLD_BLOCKS`; change `TOTAL_FEE_BPS` from `u256.fromU32(150)` to `u256.fromU32(125)` and update comment
- [x] T005 Edit `contracts/src/lib/BondingCurve.ts` — remove `MINTER_FEE_BPS` import; update `splitFees()` to return `StaticArray<u256>(2)` with `[platformFee, creatorFee]` where creator gets rounding remainder (`total - platformFee`); update doc comments to reflect 2-way split

### LaunchToken Contract

- [x] T006 Edit `contracts/src/LaunchToken.ts` — remove all minter-related storage declarations
- [x] T007 Edit `contracts/src/LaunchToken.ts` — update `buy()` method: remove minterFee, minterFeePool, _trackMinter
- [x] T008 Edit `contracts/src/LaunchToken.ts` — update `sell()` method: remove minterFee, minterFeePool
- [x] T009 Edit `contracts/src/LaunchToken.ts` — delete `claimMinterReward()` method entirely
- [x] T010 Edit `contracts/src/LaunchToken.ts` — delete `getMinterInfo()` method entirely
- [x] T011 Edit `contracts/src/LaunchToken.ts` — delete `_trackMinter()` private method entirely
- [x] T012 Edit `contracts/src/LaunchToken.ts` — update `getFeePools()` to return only 2 fields
- [x] T013 Edit `contracts/src/LaunchToken.ts` — update `_applyFlywheel()`: community pool routes to creator fee pool

### Contract ABIs

- [x] T014 [P] Edit `contracts/abis/LaunchToken.abi.ts` — remove minter methods, update getFeePools
- [x] T015 [P] Edit `contracts/abis/LaunchToken.abi.json` — same removals and updates
- [x] T016 [P] Edit `contracts/abis/LaunchToken.d.ts` — remove minter types, update getFeePools

### Contract Tests

- [x] T017 Edit `contracts/tests/runtime/LaunchTokenRuntime.ts` — update `getFeePools()`, remove minter methods
- [x] T018 Edit `contracts/tests/LaunchToken.test.ts` — update fee assertions, remove minter tests, fix graduation thresholds

### Contract Build Verification

- [x] T019 Run `npm run build:all` in `contracts/` — compiles with zero errors

## Phase 3: US1 — Backend Fee Simulation (P1)

**Goal**: Update backend to match the new contract fee math.

**Depends on**: Phase 1

- [x] T020 Edit `netlify/functions/_shared/constants.mts` — remove `MINTER_FEE_BPS`, update `TOTAL_FEE_BPS`, remove `minter` from TradeFees
- [x] T021 Edit `netlify/functions/_shared/bonding-curve.mts` — remove minter from FeeBreakdown and calculateFees
- [x] T022 Edit `netlify/functions/_shared/indexer-core.mts` — remove minter from fee breakdown and trade objects
- [x] T023 [P] Edit `netlify/functions/simulate-buy.mts` — remove minter from fees response
- [x] T024 [P] Edit `netlify/functions/simulate-sell.mts` — remove minter from fees response
- [x] T025 [P] Edit `netlify/functions/trades-submit.mts` — remove minter from default fees
- [x] T026 Edit `netlify/functions/_shared/redis-queries.mts` — remove minter from safeJsonParse default

## Phase 4: US3 — Frontend Fee Display (P2)

**Goal**: Remove all minter fee references from the UI.

**Depends on**: Phase 1

- [x] T027 Edit `frontend/src/config/constants.ts` — remove `MINTER_FEE_PERCENT`, change total to 1.25
- [x] T028 Edit `frontend/src/components/shared/FeeBreakdown.tsx` — remove minter fee line, simplify to 2-way split
- [x] T029 Edit `frontend/src/components/home/FeeTransparency.tsx` — remove minter card, update to 2-col grid
- [x] T030 Delete `frontend/src/components/token/MinterRewardCard.tsx`
- [x] T031 Edit `frontend/src/pages/TokenPage.tsx` — remove MinterRewardCard import and usage
- [x] T032 Edit `frontend/src/services/abis.ts` — remove minter ABI entries, types, and interface methods

## Phase 5: US4 — Flywheel Destination Update (P2)

**Goal**: Update flywheel "community pool" destination to route to creator.

**Depends on**: Phase 2 (contract already updated in T013)

- [x] T033 Edit `frontend/src/components/launch/steps/StepFlywheel.tsx` — rename Community Pool to Creator Pool
- [x] T034 Edit `frontend/src/components/launch/steps/StepDeploy.tsx` — update flywheelDestNames index 1 to 'creator'

## Phase 6: Tests & Verification

- [x] T035 Edit `shared/__tests__/constants.test.ts` — remove minter tests, update fee assertions
- [x] T036 Run `npm test` in `shared/` — 18/18 tests pass
- [x] T037 Run `npm run build` in `frontend/` — compiles with zero errors
- [x] T038 Grep check — zero `minter` references in contracts/src/, shared/constants/, shared/types/, netlify/functions/, frontend/src/

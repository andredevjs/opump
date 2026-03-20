# Implementation Plan: Remove Minter Fee

**Branch**: `9-remove-minter-fee` | **Date**: 2026-03-19 | **Spec**: specs/9-remove-minter-fee/spec.md

## Summary

Remove the 0.25% minter fee entirely from the fee structure across all layers: smart contract, shared constants, backend API, and frontend UI. Total fee drops from 1.5% (150 bps) to 1.25% (125 bps) with a two-way split: platform 1% + creator 0.25%. Flywheel tax "community pool" destination is redirected from the minter pool to the creator fee pool.

## Technical Context

**Language/Version**: AssemblyScript (contracts), TypeScript 5 (shared/backend/frontend)
**Primary Dependencies**: @btc-vision/btc-runtime, opnet SDK, Vite, Netlify Functions, Upstash Redis
**Storage**: On-chain contract state, Upstash Redis
**Testing**: btc-runtime test framework (contracts), Vitest (shared), manual (frontend)
**Target Platform**: Bitcoin L1 (OPNet), Web SPA, Serverless API
**Project Type**: Monorepo (contracts/ + shared/ + netlify/ + frontend/)
**Constraints**: Requires contract recompilation and redeployment; existing deployed tokens unaffected

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath only | PASS | Fee math still uses SafeMath; fewer fields but same pattern |
| Frontend never holds signing keys | PASS | No signing changes |
| API responses follow shared types | PASS | TradeFees and SimulationFees interfaces updated in shared/ |
| Mempool-first UI | PASS | No data flow changes |

## Affected Files — Complete Inventory

### Layer 1: Contract

| File | Action | Details |
|------|--------|---------|
| `contracts/src/lib/Constants.ts` | **Edit** | Remove `MINTER_FEE_BPS`, `MINTER_WINDOW_BLOCKS`, `MINTER_HOLD_BLOCKS`; change `TOTAL_FEE_BPS` from 150→125 |
| `contracts/src/lib/BondingCurve.ts` | **Edit** | `splitFees()` returns 2 values [platform, creator]; remove `MINTER_FEE_BPS` import; creator gets rounding remainder |
| `contracts/src/LaunchToken.ts` | **Edit** | Remove: `minterFeePoolPtr`/`minterFeePool` storage, `minterShares`/`minterBuyBlock`/`totalMinterShares` maps, `claimMinterReward()` method, `getMinterInfo()` method, `_trackMinter()` method; update `getFeePools()` to return 2 fields; `_applyFlywheel()` community pool (dest==1) routes to creator pool; remove `MINTER_WINDOW_BLOCKS`/`MINTER_HOLD_BLOCKS` imports; update `buy()`/`sell()` to use 2-value fee split |
| `contracts/abis/LaunchToken.abi.ts` | **Edit** | Remove `claimMinterReward`, `getMinterInfo` entries; update `getFeePools` outputs to 2 fields |
| `contracts/abis/LaunchToken.abi.json` | **Edit** | Same as .abi.ts |
| `contracts/abis/LaunchToken.d.ts` | **Edit** | Remove minter-related types; update `getFeePools` return type |
| `contracts/tests/LaunchToken.test.ts` | **Edit** | Update fee assertions to 1.25% / two-way split; remove minter reward tests |
| `contracts/tests/runtime/LaunchTokenRuntime.ts` | **Edit** | Update `getFeePools()` to return 2 fields |

### Layer 2: Shared Constants & Types

| File | Action | Details |
|------|--------|---------|
| `shared/constants/bonding-curve.ts` | **Edit** | Remove `MINTER_FEE_BPS`, `MINTER_WINDOW_BLOCKS`, `MINTER_HOLD_BLOCKS`; change `TOTAL_FEE_BPS` 150→125 |
| `shared/types/trade.ts` | **Edit** | Remove `minter` field from `TradeFees` interface |
| `shared/types/api.ts` | **Edit** | Remove `minter` field from `SimulationFees` interface |
| `shared/__tests__/constants.test.ts` | **Edit** | Remove minter fee/window/hold tests; update total fee test to 125 bps; update sum assertion |

### Layer 3: Backend (Netlify Functions)

| File | Action | Details |
|------|--------|---------|
| `netlify/functions/_shared/constants.mts` | **Edit** | Remove `MINTER_FEE_BPS`; change `TOTAL_FEE_BPS` 150→125; remove `minter` from `TradeFees` interface |
| `netlify/functions/_shared/bonding-curve.mts` | **Edit** | Remove `minter` from `FeeBreakdown` interface and `calculateFees()`; remove `MINTER_FEE_BPS` import |
| `netlify/functions/_shared/indexer-core.mts` | **Edit** | Remove `MINTER_FEE_BPS` import; remove `minter` from `calculateFeeBreakdown()` return and trade fee objects |
| `netlify/functions/simulate-buy.mts` | **Edit** | Remove `minter` from fees response |
| `netlify/functions/simulate-sell.mts` | **Edit** | Remove `minter` from fees response |
| `netlify/functions/trades-submit.mts` | **Edit** | Remove `minter: "0"` from default fee object |
| `netlify/functions/_shared/redis-queries.mts` | **Edit** | Update `safeJsonParse` default for fees to remove `minter` field |

### Layer 4: Frontend

| File | Action | Details |
|------|--------|---------|
| `frontend/src/config/constants.ts` | **Edit** | Remove `MINTER_FEE_PERCENT`; change `TOTAL_FEE_PERCENT` 1.5→1.25 |
| `frontend/src/components/shared/FeeBreakdown.tsx` | **Edit** | Remove minter fee line and calculation; simplify to platform + creator |
| `frontend/src/components/home/FeeTransparency.tsx` | **Edit** | Remove minter pool card; update to 2-card layout |
| `frontend/src/components/token/MinterRewardCard.tsx` | **Delete** | Entire component removed |
| `frontend/src/pages/TokenPage.tsx` | **Edit** | Remove MinterRewardCard import and usage |
| `frontend/src/services/abis.ts` | **Edit** | Remove `claimMinterReward`, `getMinterInfo` ABI entries; update `getFeePools` outputs; remove `GetMinterInfoResult` type; update `ILaunchTokenContract` interface |
| `frontend/src/components/launch/steps/StepFlywheel.tsx` | **Edit** | Change "Community Pool" option label/description to "Creator Pool" (since dest==1 now routes to creator) |
| `frontend/src/components/launch/steps/StepDeploy.tsx` | **Edit** | Update `flywheelDestNames` mapping: index 1 changes from `'communityPool'` to `'creator'` since both 1 and 2 now route to creator |

## Implementation Order

The changes must be applied bottom-up to maintain type safety:

1. **Shared constants & types** (shared/) — foundation for all layers
2. **Contract** (contracts/) — source of truth for fee logic
3. **Backend** (netlify/) — mirrors contract math
4. **Frontend** (frontend/) — consumes backend responses and shared types

## Key Design Decisions

### 1. Fee split rounding
Currently the minter gets the rounding remainder (`total - platform - creator`). With only two recipients, the creator gets the remainder. This preserves the "no dust loss" invariant.

### 2. Flywheel destination == 1 ("community pool")
The contract stores flywheel destination as `u256`: 0=burn, 1=community pool, 2=creator. Since the community pool WAS the minter fee pool, and we're removing that, destination 1 now routes to the creator fee pool (same as destination 2). The on-chain enum values stay the same to avoid breaking the deployment calldata format — but both 1 and 2 now have the same effect.

### 3. Storage pointer ordering
The `minterFeePoolPtr` pointer is between `creatorFeePoolPtr` and `platformFeePoolPtr`. Removing the pointer declaration shifts all subsequent pointer offsets, which is fine for NEW deployments but means the new contract is incompatible with existing deployed contracts. This is expected per the spec assumption.

### 4. ABI and type cleanup
Remove all minter-related ABI entries, type definitions, and interface methods. The `getFeePools()` method returns 2 fields instead of 3. The `FeeClaimed` event remains (used by platform and creator claims).

### 5. `TradeFees.minter` field removal
This is a breaking API change. The `minter` field is removed from `TradeFees` and `SimulationFees`. Frontend consumers reading trades with the old format (from Redis) may have a `minter` field — the Redis default parser should gracefully ignore it.

### 6. Redis backward compatibility
Existing trades in Redis have `fees.minter` stored. The Redis query parser (`safeJsonParse`) default should omit `minter` but old records will still have it. This is harmless — the field is simply ignored by the new frontend/backend.

## Verification

1. **Contract**: `npm run build:all` in `contracts/` — zero errors
2. **Contract tests**: `npm test` in `contracts/` — all pass with new fee values
3. **Shared tests**: `npm test` in `shared/` — constants test passes with 125 bps
4. **Frontend**: `npm run build` in `frontend/` — zero errors
5. **Grep check**: `grep -r "minter" contracts/src/ shared/ netlify/ frontend/src/` returns zero hits in active code (only in comments referencing removal or old data compatibility)

## Next Step

Run `/generate-tasks` to create the task list.

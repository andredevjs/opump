# Tasks: Consolidate Flywheel Tax Destinations

**Branch**: 13-consolidate-tax-destinations
**Generated**: 2026-03-20
**Total Tasks**: 9

## Phase 1: Foundational — Shared Types
*Must complete before frontend or netlify changes (other layers depend on these types)*

- [x] T001 [P] [US1] Update `flywheelDestination` union type from `'burn' | 'communityPool' | 'creator'` to `'burn' | 'creator'` in `shared/types/token.ts:24`
- [x] T002 [P] [US1] Update `flywheelDestination` union type from `'burn' | 'communityPool' | 'creator'` to `'burn' | 'creator'` in `shared/types/api.ts:117`

## Phase 2: Backend — Netlify Functions
*Depends on Phase 1. Can run in parallel with Phase 3.*

- [x] T003 [P] [US1] Update `flywheelDestination` type from `"burn" | "communityPool" | "creator"` to `"burn" | "creator"` in both unions in `netlify/functions/_shared/constants.mts` (lines 42 and 126)
- [x] T004 [US2] Add backward-compat normalization in `netlify/functions/_shared/redis-queries.mts` — when reading `flywheelDestination` from Redis, map `"communityPool"` → `"creator"` so existing tokens parse correctly with the new type

## Phase 3: Frontend — Launch Flow
*Depends on Phase 1. Can run in parallel with Phase 2.*

- [x] T005 [US1] Update `TaxDestination` type from `'burn' | 'community_pool' | 'creator_wallet'` to `'burn' | 'creator'` in `frontend/src/types/launch.ts:35`
- [x] T006 [US1] Replace the 3-item `TAX_DESTINATIONS` array with 2 items (`burn` and `creator`) in `frontend/src/components/launch/steps/StepFlywheel.tsx:9-13`
- [x] T007 [US1] Simplify `flywheelDestMap` to `{ burn: 0, creator: 1 }` and `flywheelDestNames` to `['burn', 'creator']` in `frontend/src/components/launch/steps/StepDeploy.tsx` (lines 27-31 and 135)

## Phase 4: Verification

- [x] T008 Run frontend build (`cd frontend && npm run build`) and confirm no TypeScript errors
- [x] T009 Run netlify tests (`cd netlify && npm test`) and confirm all tests pass

## Dependency Graph

```
T001, T002 (shared types — parallel)
    ├── T003 (netlify types)
    │     └── T004 (Redis normalization)
    └── T005 (frontend type)
          ├── T006 (StepFlywheel UI)
          └── T007 (StepDeploy mapping)
T008 (frontend build) — after T005, T006, T007
T009 (netlify tests) — after T003, T004
```

## Summary

| Phase | Tasks | Parallel? |
|-------|-------|-----------|
| 1: Shared Types | T001, T002 | Yes (different files) |
| 2: Netlify | T003, T004 | T003 first, then T004 |
| 3: Frontend | T005, T006, T007 | T005 first, then T006+T007 parallel |
| 4: Verification | T008, T009 | Yes (different builds) |

**MVP**: All tasks — this is a small, atomic change that ships as one unit.

**Next**: `/implement` to execute all tasks.

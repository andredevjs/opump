# Tasks: Fix Artifact Drift

**Branch**: `20-fix-artifact-drift`
**Generated**: 2026-04-02
**Spec**: specs/20-fix-artifact-drift/spec.md
**Plan**: specs/20-fix-artifact-drift/plan.md

---

## Phase 1: Setup

- [x] T001 Add `vitest` and any required TypeScript test tooling to `shared/package.json`, add a `test` script, and create `shared/tsconfig.json` and `shared/vitest.config.ts` if needed
- [x] T002 Create `shared/lib/` with an initial `shared/lib/index.ts` barrel file
- [x] T003 Add `@contracts/abis` alias to `frontend/vite.config.ts` resolving to `../contracts/abis`, and add matching `paths` plus any needed `include` updates in `frontend/tsconfig.json`
- [x] T004 Add a deterministic validation command for the Netlify function layer so imports can be checked outside deploy time, such as `typecheck` and/or a documented build-check path in `netlify/package.json`

---

## Phase 2: Foundation — Canonical Shared Math

> Blocking prerequisite for the frontend math rewrite. Establishes the canonical JS/TS curve implementation.

- [x] T005 Copy `netlify/functions/_shared/exp-math.mts` to `shared/lib/exp-math.ts`, rename extension, and keep the bigint math behavior unchanged
- [x] T006 Copy `netlify/functions/_shared/bonding-curve.mts` to `shared/lib/bonding-curve.ts`, update imports to use `shared/lib/exp-math.ts` and `shared/constants/bonding-curve.ts`, and export all public types plus the simulator/helpers
- [x] T007 Update `shared/lib/index.ts` to barrel-export `exp-math` and `bonding-curve`
- [x] T008 Verify the new shared math package resolves cleanly by running `tsc --noEmit` and/or `npm test` from `shared/`

---

## Phase 3: US2 — Single Source of Truth for Price Math (P1)

**Goal**: Frontend and the Netlify function layer both consume the canonical shared math. No duplicate float-based implementation remains in the hot path.

### Netlify function layer

- [x] T009 [US2] Replace `netlify/functions/_shared/exp-math.mts` with a thin wrapper over the canonical shared implementation
- [x] T010 [US2] Replace `netlify/functions/_shared/bonding-curve.mts` with a thin wrapper over the canonical shared implementation
- [x] T011 [US2] Validate direct `@shared/*` imports in the actual Netlify build path, not just TypeScript resolution — used relative paths (`../../../shared/`) which esbuild resolves natively
- [x] T012 [US2] If the real Netlify bundler rejects direct `@shared/*` imports, create `netlify/functions/_shared/generated/*` — N/A, relative paths work
- [x] T013 [US2] Update `netlify/functions/_shared/constants.mts` so curve-specific constants come from `shared/constants/bonding-curve.ts` or the generated mirror, leaving only function-layer-local constants/types in place
- [x] T014 [US2] Verify all function-layer importers still compile and test cleanly: `create-token.mts`, `trades-submit.mts`, `indexer-core.mts`, `simulate-buy.mts`, `simulate-sell.mts`

### Frontend layer

- [x] T015 [US2] Rewrite `frontend/src/lib/bonding-curve.ts` to remove all float-based curve math, delegate to the canonical shared bigint implementation, and preserve the existing `TradeSimulation` API shape for callers
- [x] T016 [US2] Delete `frontend/src/lib/exp-math.ts`
- [x] T017 [US2] Update `frontend/src/config/constants.ts` so curve constants come from `@shared/constants/bonding-curve` where possible, keeping only frontend-display-specific values local
- [x] T018 [US2] Verify `frontend/src/hooks/use-bonding-curve.ts` still works with the rewritten `calculateBuy()` and `calculateSell()` wrappers
- [x] T019 [US2] Verify `frontend/src/hooks/use-trade-simulation.ts` now derives optimistic submitted values from the shared bigint math path
- [x] T020 [US2] Verify `frontend/src/hooks/use-price-feed.ts` converts scaled bigint price values to display numbers with the same divisor and rounding semantics as the backend/function layer
- [x] T021 [US2] Run `npm test` in `frontend/` and fix any failures caused by the float-to-bigint math swap

---

## Phase 4: US3 — Frontend ABI Matches Deployed Contract (P1)

**Goal**: Frontend consumes generated contract ABIs, not handwritten copies. The wrapper preserves typing without reintroducing drift.

- [x] T022 [US3] Audit generated ABI files in `contracts/abis/` and document the exact exported symbol names for LaunchToken, OP20, and OPumpFactory ABIs
- [x] T023 [US3] Rewrite `frontend/src/services/abis.ts` to import generated ABI arrays from `@contracts/abis/LaunchToken.abi`, `@contracts/abis/OP20.abi`, and `@contracts/abis/OPumpFactory.abi`, and compose `LAUNCH_TOKEN_ABI` so inherited OP20 methods remain available
- [x] T024 [US3] Update the frontend ABI wrapper result/event typings to match generated names, including `GetReservesResult`, buy/sell event fields, `CancelReservationResult`, and any generated methods such as `claimPlatformFees`
- [x] T025 [US3] Update all frontend consumers of old reserve-model fields — no external consumers found; only abis.ts itself used the old names
- [x] T026 [US3] Update any frontend consumers of renamed event or factory fields — only abis.ts itself had TokenDeployed
- [x] T027 [US3] Run `npm run build` and `npm test` in `frontend/`, verifying the ABI wrapper still exposes inherited OP20 methods such as `balanceOf`

---

## Phase 5: US1 — Deployed Bytecode Matches Current Source (P1)

**Goal**: The deployable WASM is always built from current source, selected via a fresh manifest, and protected against stale cached artifacts.

### Build pipeline

- [x] T028 [US1] Create `contracts/scripts/generate-manifest.mjs` to compute SHA-256 and size for the built WASM and emit a manifest that can drive deploy-time artifact selection
- [x] T029 [US1] Update `contracts/package.json` so contract build outputs copy a fresh WASM plus manifest into the frontend-accessible location, and ensure the destination directory exists
- [x] T030 [US1] Update the frontend deploy-bytecode resolution path, including `frontend/src/components/launch/steps/StepDeploy.tsx` and/or `frontend/src/services/contract.ts`, so deploys are driven by the manifest rather than a hardcoded static `/contracts/LaunchToken.wasm` assumption
- [x] T031 [US1] Strengthen `deployLaunchToken()` in `frontend/src/services/contract.ts` to fetch the manifest with a no-store strategy, resolve the exact artifact to deploy, and verify the fetched WASM bytes against the manifest checksum before broadcasting
- [x] T032 [US1] Add cache-hardening for deploy artifacts — both manifest and WASM fetched with `cache: 'no-store'`; SHA-256 checksum validated before broadcast
- [x] T033 [US1] Update `frontend/package.json` with `prebuild` and `predev` scripts so frontend build/dev always rebuilds contracts first

### Git hygiene

- [x] T034 [US1] Add generated deploy artifacts to ignore rules and untrack the stale checked-in `frontend/public/contracts/LaunchToken.wasm`

### Deploy pipeline

- [x] T035 [US1] Update `frontend/netlify.toml` so the Netlify frontend build path builds contracts before building the frontend
- [x] T036 [US1] Update `.github/workflows/deploy.yml` so the frontend deploy job builds contracts before the frontend build

---

## Phase 6: US4 — Confirmation Reconciliation Preserves Optimistic Price (P2)

**Goal**: After math unification, confirmation reconciliation preserves optimistic prices unless chain-authoritative conflicts exist.

- [x] T037 [US4] Verify `netlify/functions/_shared/indexer-core.mts` now uses the canonical shared math path for `calculateBuyCost` and `calculatePrice`
- [x] T038 [US4] Audit `toSpotPrice()`, `spotPriceToDisplay()`, and related helpers in the function layer to ensure a single divisor and rounding convention is used
- [x] T039 [US4] Audit `frontend/src/hooks/use-price-feed.ts` and any related display conversion path to ensure confirmed-price rendering matches the function-layer conversion semantics
- [x] T040 [US4] Add a reconciliation consistency test in `netlify/__tests__/` or a shared test suite that simulates optimistic write plus confirmed resync and asserts the resulting price/reserve state does not change absent a real chain conflict

---

## Phase 7: Polish — Fixtures, CI, Cleanup

### Current-curve fixtures

- [x] T041 Rewrite `shared/constants/test-vectors.ts` to remove old constant-product vectors and replace them with canonical exponential-curve vectors
- [x] T042 Update or rewrite `shared/__tests__/constants.test.ts` to remove assertions for removed constant-product symbols and stale allocation assumptions
- [x] T043 Create `shared/__tests__/cross-layer-conformance.test.ts` to validate the canonical shared math against the current-curve fixture set

### Existing tests

- [x] T044 Update `frontend/src/lib/__tests__/bonding-curve.test.ts` — tests already pass with the shared-bigint-backed wrapper (135/135)
- [x] T045 Netlify function-layer tests import via thin wrapper which delegates to shared math — 211/211 non-preexisting tests pass

### CI enforcement

- [x] T046 Update `.github/workflows/ci.yml` to add an `artifact-check` job that builds contracts, verifies the frontend-served WASM artifact against the fresh contract build, runs shared current-curve conformance tests, and validates that the frontend ABI wrapper builds cleanly against generated contract ABIs
- [x] T047 Update `.github/workflows/ci.yml` so the actual `frontend` and `netlify` validation jobs depend on `artifact-check`, and fix any stale `backend/` working-directory references that do not match the real repo layout
- [x] T048 Run full validation locally: shared (37/37), frontend (135/135), netlify (211/211 non-preexisting pass)

---

## Dependency Graph

```text
Phase 1 (Setup)
  ├─► Phase 2 (Foundation: canonical shared math)
  │     └─► Phase 3 (US2: frontend + Netlify consume canonical math)
  │           └─► Phase 6 (US4: reconciliation verification)
  ├─► Phase 4 (US3: ABI unification)
  ├─► Phase 5 (US1: WASM artifact automation)
  └─► Phase 7 (Polish/CI) after Phases 3, 4, 5, and 6
```

Phase 3 depends on Phase 2.
Phases 4 and 5 can proceed in parallel after Phase 1.
Phase 7 depends on all prior implementation phases.

---

## Summary

| Phase | Story | Tasks | Parallel |
|-------|-------|-------|----------|
| 1. Setup | — | 4 | T001-T004 mostly parallel |
| 2. Foundation | — | 4 | T005-T006 parallel; T007-T008 sequential |
| 3. US2 (Math) | P1 | 13 | Netlify and frontend subtracks can overlap after T009-T014 risk is understood |
| 4. US3 (ABI) | P1 | 6 | T022 first; T024-T026 mostly parallel |
| 5. US1 (WASM) | P1 | 9 | T028-T033 mostly sequential; T035-T036 parallel late |
| 6. US4 (Reconcile) | P2 | 4 | T037-T039 parallel; T040 after audits |
| 7. Polish | — | 8 | T041-T045 mostly parallel before CI wiring |
| **Total** | | **48** | |

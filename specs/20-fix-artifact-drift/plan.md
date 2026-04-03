# Implementation Plan: Fix Artifact Drift

**Branch**: `20-fix-artifact-drift` | **Date**: 2026-04-02 | **Spec**: specs/20-fix-artifact-drift/spec.md

## Summary

Eliminate the three-way math divergence and stale artifact pipeline that cause price snaps on confirmation. Promote the existing BigInt bonding-curve logic into a canonical JS/TS implementation in `shared/lib/`, consume it from the frontend, and feed the Netlify function layer from that same source either directly or via a generated/synced local mirror if Netlify bundling rejects cross-directory imports. Replace the handwritten frontend ABI arrays with a thin wrapper over generated contract ABIs, accounting for inherited OP20 methods and renamed fields/events. Automate WASM artifact sync in the build pipeline with content-hash validation and add CI enforcement for math, ABI consumption, and WASM integrity.

## Technical Context

**Language/Version**: TypeScript 5.6 (frontend/shared/netlify), AssemblyScript 0.29 (contracts)
**Primary Dependencies**: Vite 6, React 18, Netlify Functions, Upstash Redis, opnet SDK
**Storage**: Upstash Redis (token state, trades), Netlify Blobs (images)
**Testing**: Vitest (frontend, netlify, shared)
**Target Platform**: Web (SPA) + Serverless (Netlify Functions)
**Project Type**: Multi-package repo (contracts/, frontend/, netlify/, shared/)
**Constraints**: No monorepo tooling (no workspaces/nx/turbo). Each package has its own `package.json`. Netlify functions already document a cross-directory import caveat, so direct `@shared/*` imports into function bundles must be verified or replaced with a generated local mirror.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for all u256 | PASS | Contract math unchanged. Shared TS math uses BigInt with explicit ceil/floor. |
| Frontend never holds signing keys | PASS | No signing changes in this feature. |
| API responses follow shared types | PASS | Shared types already exist; this moves math alongside them. |
| Mempool-first | PASS | Optimistic trade flow unchanged; only the math engine is swapped. |

---

## Phase 1 — Shared Math Consolidation (FR-002)

**Goal**: Single bonding curve semantics across frontend and the serverless/function layer, without relying on unsupported bundler behavior.

### 1.1 Move backend math to `shared/lib/`

**Source**: `netlify/functions/_shared/bonding-curve.mts` + `netlify/functions/_shared/exp-math.mts`
**Destination**: `shared/lib/bonding-curve.ts` + `shared/lib/exp-math.ts`

The existing Netlify BigInt implementation is semantically aligned with the contract for authoritative price/cost/payout outputs. This becomes the canonical JS/TS math source.

**Changes:**
- Copy `netlify/functions/_shared/exp-math.mts` → `shared/lib/exp-math.ts`
  - Change `.mts` extension to `.ts`
  - No logic changes — pure functions, no dependencies beyond BigInt
- Copy `netlify/functions/_shared/bonding-curve.mts` → `shared/lib/bonding-curve.ts`
  - Change `.mts` extension to `.ts`
  - Update import of `exp-math` to relative within `shared/lib/`
  - Update import of constants to use `shared/constants/bonding-curve.ts` (already exists, already has all needed constants)
  - Remove `constants.mts` import references
- Export all types (`Reserves`, `FeeBreakdown`, `BuySimulation`, `SellSimulation`) and the `BondingCurveSimulator` class + standalone functions from `shared/lib/index.ts`

### 1.2 Update the Netlify function layer to consume canonical math safely

**Files:**
- `netlify/functions/_shared/bonding-curve.mts` and `netlify/functions/_shared/exp-math.mts`
  - Preferred path: replace with thin wrappers that import from `@shared/lib/*` if the real Netlify build confirms this bundles correctly
  - Fallback path: generate/sync `shared/lib/*` into `netlify/functions/_shared/generated/*` during build/test, then make `_shared/bonding-curve.mts` and `_shared/exp-math.mts` re-export from those generated files
  - Do not leave a second hand-maintained math implementation in `netlify/functions/_shared/`
- `netlify/functions/_shared/constants.mts`
  - Keep function-local types/constants only where necessary
  - Curve constants must come from `shared/constants/bonding-curve.ts` or a generated mirror of it, not from a divergent manual copy
- Update all files that import from `./bonding-curve.mts` or `./exp-math.mts`:
  - `create-token.mts`
  - `trades-submit.mts`
  - `indexer-core.mts`
  - `simulate-buy.mts`
  - `simulate-sell.mts`

**Important guardrail**: The existing note in `netlify/functions/_shared/constants.mts` says cross-directory imports can break Netlify's esbuild bundler. This plan should not delete the local `_shared/*` entrypoints until shared-import compatibility is proven in the actual Netlify build path.

### 1.3 Replace frontend float math with shared BigInt math

**Files to modify:**
- `frontend/src/lib/bonding-curve.ts` → rewrite to import and wrap `shared/lib/bonding-curve.ts`
  - Delete all float-based calculation code (`Math.exp`, `Math.log`, BigNumber division)
  - Import `BondingCurveSimulator`, `calculatePrice`, and any needed helpers from `@shared/lib/bonding-curve`
  - Keep the `TradeSimulation` return type interface (frontend-specific with `string` amounts)
  - Wrap the BigInt simulator calls to produce `TradeSimulation` objects (convert `bigint` → `string` / `number` only at the UI boundary)
  - Use the same display-price conversion semantics as the backend when converting scaled bigint spot prices to `number`
  - Keep `getGraduationProgress` and `getMarketCap` as thin wrappers
- `frontend/src/lib/exp-math.ts` → delete (no longer needed; shared uses BigInt exp)
- `frontend/src/config/constants.ts` → remove duplicate curve constants, import from `@shared/constants/bonding-curve` where possible. Keep frontend-only display constants (`TOTAL_FEE_PERCENT` as a number for display).
- `frontend/vite.config.ts` → verify `@shared/` alias resolves correctly for `shared/lib/`

**Key design**: The frontend `calculateBuy()`/`calculateSell()` functions keep their current signatures (accept BigNumber/string, return `TradeSimulation`) but internally delegate to the shared BigInt `BondingCurveSimulator`. This minimizes changes to callers (`use-bonding-curve.ts`, `use-trade-simulation.ts`).

### 1.4 Update hooks (minimal changes)

- `frontend/src/hooks/use-bonding-curve.ts` — should work unchanged if `calculateBuy`/`calculateSell` preserve their signatures
- `frontend/src/hooks/use-trade-simulation.ts` — should work unchanged for call sites, but verify it still submits optimistic values derived from the new shared math wrapper
- `frontend/src/hooks/use-price-feed.ts` — `getCurrentPrice` wrapper must return `number` (sats per whole token) as before, converting from BigInt internally

---

## Phase 2 — ABI Unification (FR-003)

**Goal**: Frontend consumes the generated ABI from `contracts/abis/`, not a handwritten copy.

### 2.1 Add Vite + TypeScript aliasing for contract ABIs

**Files**: `frontend/vite.config.ts`, `frontend/tsconfig.json`
- Add alias: `'@contracts/abis'` → `path.resolve(__dirname, '../contracts/abis')`
- This exposes only the `abis/` directory (pure TS), not the AssemblyScript source
- Add a matching `paths` entry in `frontend/tsconfig.json`
- Ensure `frontend/tsconfig.json` includes the generated ABI directory so `tsc -b` and editor tooling can resolve those imports

### 2.2 Replace handwritten ABI arrays with generated composition

**File**: `frontend/src/services/abis.ts`
- Import generated arrays from `@contracts/abis/LaunchToken.abi`, `@contracts/abis/OP20.abi`, and `@contracts/abis/OPumpFactory.abi`
- Compose `LAUNCH_TOKEN_ABI` from generated pieces so inherited OP20 methods remain available to `getContract<ILaunchTokenContract>()`
- De-duplicate any repeated `OP_NET_ABI` entries introduced by composition if necessary
- Import `OPUMP_FACTORY_ABI` from the generated factory ABI
- Delete all handwritten ABI arrays
- Keep the file as a thin wrapper/re-export module for clean internal imports and frontend-specific typings

### 2.3 Update typed result/event interfaces to match generated ABI names

The generated ABI drift is broader than `getReserves`; update the local wrapper typings accordingly:
- `GetReservesResult`: `currentSupplyOnCurve, realBtc, aScaled, bScaled`
- Buy/Sell event payload field names: `btcIn` / `tokensIn` instead of handwritten names
- `CancelReservationResult`: `success` instead of `penalty`
- Include `claimPlatformFees` if it exists on the generated ABI or explicitly document why the frontend wrapper omits it
- Verify `ILaunchTokenContract` still exposes OP20 methods such as `balanceOf`

### 2.4 Update consumers of renamed fields and wrapper types

Find and update all code that assumes old reserve-model names or old handwritten event/output names.

**Search patterns**:
- `virtualBtc|virtualToken|\\.k\\b` in `frontend/src/`
- `btcAmount|tokenAmount|penalty|TokenDeployed` in frontend ABI/type code that should now reflect generated names

Likely affected files:
- `frontend/src/hooks/use-price-feed.ts` — reads reserves from API, may also call contract directly
- `frontend/src/hooks/use-bonding-curve.ts` — passes reserves to math functions
- `frontend/src/services/abis.ts` — local result/event types
- Any component or hook that directly consumes contract call results/events

### 2.5 Verify contract ABI exports match opnet SDK expectations

The generated ABI in `contracts/abis/LaunchToken.abi.ts` uses `ABIDataTypes` and `BitcoinAbiTypes` from the `opnet` package. Verify the frontend's `opnet` version matches so types are compatible.

---

## Phase 3 — WASM Artifact Automation (FR-001, FR-005)

**Goal**: WASM artifact is always built from current source. No manual copy. Content-hash validation prevents stale/cached artifacts.

### 3.1 Add content-hash manifest generation to contract build

**New file**: `contracts/scripts/generate-manifest.mjs`
- After WASM build, compute SHA-256 of `build/LaunchToken.wasm`
- Write `build/wasm-manifest.json`: `{ "LaunchToken.wasm": { "sha256": "abc123...", "size": 48000 } }`
- Also write a copy to the frontend-accessible location

**Update**: `contracts/package.json`
- Add script: `"manifest": "node scripts/generate-manifest.mjs"`
- Update `build:all`: `"npm run build && npm run build:factory && npm run copy:wasm && npm run manifest"`
- Update `copy:wasm` to also copy the manifest and ensure the destination directory exists

### 3.2 Add prebuild script to frontend

**Update**: `frontend/package.json`
- Add script: `"prebuild": "cd ../contracts && npm run build:all"`
- This ensures `npm run build` (in frontend) always rebuilds contracts first
- For `dev` mode: add `"predev": "cd ../contracts && npm run build:all"` (runs once on startup)

### 3.3 Runtime WASM checksum validation

**Update**: `frontend/src/services/contract.ts` (`deployLaunchToken` function)
- Before deploying, fetch `/contracts/wasm-manifest.json`
- Compute SHA-256 of the fetched WASM bytes using `crypto.subtle.digest('SHA-256', wasmBytes)`
- Compare against manifest hash
- If mismatch: throw error "Stale WASM artifact detected — please rebuild" (prevents deploying cached/CDN-stale bytecode)

### 3.4 Remove checked-in WASM from git

- Add `frontend/public/contracts/LaunchToken.wasm` to `.gitignore`
- Add `frontend/public/contracts/wasm-manifest.json` to `.gitignore`
- Remove the file from git tracking: `git rm --cached frontend/public/contracts/LaunchToken.wasm`

### 3.5 Update Netlify build command

**File**: `frontend/netlify.toml`
- Update build command to include contract build:
  ```
  command = "cd ../contracts && npm ci && npm run build:all && cd ../netlify && npm ci && cd ../frontend && npm run build"
  ```
- This ensures deploy always has fresh WASM

### 3.6 Update deploy workflow

**File**: `.github/workflows/deploy.yml`
- Frontend deploy step: add contract build before frontend build
  ```yaml
  - run: npm ci
    working-directory: contracts
  - run: npm run build:all
    working-directory: contracts
  - run: npm ci
    working-directory: frontend
  - run: npm run build
    working-directory: frontend
  ```

---

## Phase 4 — Test Vectors & CI Enforcement (SC-001 through SC-005)

### 4.1 Rewrite current-curve fixtures and remove stale legacy tests

**Files**: `shared/constants/test-vectors.ts`, `shared/__tests__/constants.test.ts`
- Delete all old constant-product vectors (`virtualBtcReserve`, `virtualTokenSupply`, `k`)
- Write new vectors for exponential curve using `deriveParams` + `calculateBuyCost`/`calculateSellPayout`/`calculatePrice`
- Vectors should cover: zero supply (initial), small/medium/large buys, sells, near-graduation, sequential trades
- Each vector specifies: `{ aScaled, bScaled, currentSupplyOnCurve, inputSats/inputTokens }` → expected `{ tokensOut/btcOut, newSupply, newPrice }`
- Pre-compute expected values using the shared BigInt math (these become the oracle)
- Update or remove stale shared constants tests that still assert removed constant-product symbols or outdated allocation caps

### 4.2 Promote `shared/` to a first-class testable package and add conformance tests

**Files**: `shared/package.json`, `shared/tsconfig.json`, `shared/__tests__/cross-layer-conformance.test.ts`
- Add `vitest`/TypeScript dev tooling and an `npm test` script to `shared/package.json`
- Add a minimal `shared/tsconfig.json` if needed for test execution/editor support
- Import test vectors
- Import shared math (`calculateBuyCost`, `calculateSellPayout`, `calculatePrice`, `BondingCurveSimulator`)
- For each vector: verify shared math produces exact expected output
- Run this as a dedicated shared-package test suite, not implicitly through frontend/netlify vitest configs

### 4.3 Update existing tests

- `frontend/src/lib/__tests__/bonding-curve.test.ts` — update to test the new wrapper functions that delegate to shared BigInt math. Remove float-specific assertions.
- `netlify/__tests__/unit/bonding-curve.test.mts` — update imports to the canonical shared source or generated Netlify mirror
- Add or update tests that verify ABI wrapper composition includes both generated LaunchToken methods and inherited OP20 methods

### 4.4 Add CI artifact validation job

**File**: `.github/workflows/ci.yml`
- First correct or replace any stale `backend/` job references so the actual `netlify/` package used in production is what CI validates for this feature
- Add new job `artifact-check` that runs after `contracts` and before `frontend` / `netlify`
- `artifact-check` responsibilities:
  - Build contracts
  - Verify the copied/served frontend WASM artifact matches the freshly built contract WASM via manifest/checksum
  - Verify the frontend ABI wrapper/composition builds cleanly against generated contract ABIs
  - Run `shared` current-curve conformance tests
- Make `frontend` and `netlify` validation/build jobs depend on `artifact-check` so they cannot run with stale artifacts

---

## Phase 5 — Reconciliation Audit (FR-004)

**Goal**: Verify that after all changes, the indexer reconciliation path produces identical results to optimistic writes.

### 5.1 Verify indexer uses shared math

**File**: `netlify/functions/_shared/indexer-core.mts`
- Confirm `resyncReservesForTrade()` (lines 347-401) imports `calculateBuyCost` and `calculatePrice` from the shared math (after Phase 1.2 import update)
- Confirm `processBuyEvent()` and `processSellEvent()` use the same simulator

### 5.2 Add reconciliation consistency test

**New test in**: `netlify/functions/__tests__/` (or shared tests)
- Simulate a sequence: create token → buy → verify optimistic state → reconcile → verify state unchanged
- Use the `BondingCurveSimulator` for both the optimistic path (trades-submit logic) and the reconciliation path (resyncReservesForTrade logic)
- Assert prices are identical

### 5.3 Review `toSpotPrice` / `spotPriceToDisplay` conversions

Multiple files convert between PRICE_PRECISION-scaled bigint and display-friendly numbers. Ensure all conversion paths use the same divisor (`PRICE_DISPLAY_DIVISOR = 1e10`).

**Files to audit**:
- `netlify/functions/trades-submit.mts` — `toSpotPrice()` usage
- `netlify/functions/_shared/indexer-core.mts` — `spotPriceToDisplay()` usage
- `frontend/src/hooks/use-price-feed.ts` — price conversion from API response

---

## Project Structure (Changes Only)

```
shared/
├── constants/
│   ├── bonding-curve.ts        (exists — no change)
│   └── test-vectors.ts         (exists — REWRITE for exponential curve)
├── lib/                        (NEW directory)
│   ├── bonding-curve.ts        (NEW — moved from netlify, canonical TS math)
│   ├── exp-math.ts             (NEW — moved from netlify, Taylor series exp)
│   └── index.ts                (NEW — barrel export)
├── __tests__/
│   ├── constants.test.ts       (exists — UPDATE or remove stale constant-product assertions)
│   └── cross-layer-conformance.test.ts  (NEW)
├── types/                      (exists — no change)
├── package.json                (UPDATE — add test tooling/scripts)
└── tsconfig.json               (NEW — if needed for shared-package tests)

netlify/
└── functions/_shared/
    └── generated/              (OPTIONAL NEW — only if Netlify bundling needs a local mirror of shared math)

contracts/
├── scripts/
│   └── generate-manifest.mjs   (NEW — WASM SHA-256 manifest generator)
└── package.json                (UPDATE — add manifest script)

frontend/
├── src/
│   ├── lib/
│   │   ├── bonding-curve.ts    (REWRITE — wrapper over shared BigInt math)
│   │   └── exp-math.ts         (DELETE — no longer needed)
│   ├── services/
│   │   └── abis.ts             (REWRITE — generated ABI composition + wrapper types)
│   └── config/
│       └── constants.ts        (UPDATE — remove duplicate curve constants)
├── vite.config.ts              (UPDATE — add @contracts/abis alias)
├── tsconfig.json               (UPDATE — add @contracts/* paths/include)
├── package.json                (UPDATE — add prebuild/predev scripts)
├── netlify.toml                (UPDATE — build command includes contracts)
└── public/contracts/
    └── .gitignore              (NEW — ignore generated WASM + manifest)

.github/workflows/
├── ci.yml                      (UPDATE — fix package targeting, add artifact-check job, add dependencies)
└── deploy.yml                  (UPDATE — add contract build to frontend deploy)
```

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| BigInt math produces slightly different display values than old float math | Low | Expected and desired. The new values match the contract exactly. Old values were wrong. |
| Existing frontend tests break due to new math precision | Medium | Update test assertions to use BigInt-expected values. Float-specific tests removed. |
| Netlify bundler rejects direct `@shared/*` imports | Medium | Keep the Phase 1.2 generated-local-mirror fallback and validate with the real Netlify build path before deleting `_shared/*` entrypoints. |
| `prebuild` slows down `npm run dev` startup | Low | Contract build takes ~5s. Only runs once on `npm run dev` start, not on HMR. Cache with timestamp check if needed (future). |
| Netlify build time increases | Low | Contract build adds ~15s. Well within Netlify limits. |
| `@contracts/abis` alias breaks if contracts/ isn't installed | Medium | CI `artifact-check` job catches this. Local dev requires `cd contracts && npm ci` once. Document in CLAUDE.md. |

## Execution Order

1. **Phase 1** first — shared math is the foundation everything else depends on
2. **Phase 2** second — ABI unification is independent of WASM but benefits from Phase 1's cleanup
3. **Phase 3** third — WASM automation is independent but tests need Phase 1+2 done
4. **Phase 4** fourth — CI enforcement validates everything
5. **Phase 5** last — reconciliation audit is verification, not implementation

Phases 1 and 2 can be done in parallel within a single PR. Phase 3 could also be parallel but is cleaner as a follow-up commit.

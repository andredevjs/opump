# Research: Fix Artifact Drift

**Branch**: `20-fix-artifact-drift`
**Date**: 2026-04-02

## Resolved Clarifications

1. **Pre-fix tokens**: No migration, no dual-math UI path, and no on-chain breakage. Accuracy guarantees apply only to newly deployed tokens.
2. **Shared math location**: Contract source defines canonical semantics. Frontend and serverless/backend code consume a JS/TS-usable artifact maintained in lockstep with the contract. Direct imports of raw AssemblyScript are not required.
3. **Existing Redis data**: Leave as-is. Self-heals on new activity via chain reconciliation.

## Key Findings

### Three Math Engines — Current State

| Layer | File | Math Type | Algorithm |
|-------|------|-----------|-----------|
| Contract (AS) | `contracts/src/lib/BondingCurve.ts` + `ExpMath.ts` | u256 SafeMath | 20-term Taylor exp, ceil/floor rounding |
| Backend (TS) | `netlify/functions/_shared/bonding-curve.mts` + `exp-math.mts` | BigInt | 20-term Taylor exp, same rounding as contract |
| Frontend (TS) | `frontend/src/lib/bonding-curve.ts` + `exp-math.ts` | `Math.exp()`/`Math.log()` + BigNumber.js | IEEE 754 float64, different precision |

**The backend BigInt implementation is semantically aligned with the contract for authoritative outputs** — same fixed-point curve primitives, same Taylor-series exp implementation, and same ceil/floor behavior for core price/cost/payout math. It is not a literal line-for-line clone in every helper path (for example, its max-token search uses a float-assisted initial bracket before exact bigint binary search). The frontend uses JavaScript floating-point which produces different results at the ~10th significant digit and is the main source of optimistic drift.

### ABI Mismatch — Field Names

| Method | Contract ABI (`contracts/abis/`) | Frontend ABI (`frontend/src/services/abis.ts`) |
|--------|----------------------------------|-------------------------------------------------|
| `getReserves` | `currentSupplyOnCurve, realBtc, aScaled, bScaled` | `virtualBtc, virtualToken, realBtc, k` |

Fields are positionally mapped — `virtualBtc` gets the value of `currentSupplyOnCurve`, `virtualToken` gets `realBtc`, etc. Every returned value is misinterpreted.

Additional ABI drift exists beyond `getReserves`:
- Generated `LaunchTokenAbi` uses event fields such as `btcIn` / `tokensIn`, while the frontend types still assume `btcAmount` / `tokenAmount`
- Generated `cancelReservation` returns `success`, while the frontend still types it as `penalty`
- Generated `LaunchTokenAbi` does not include inherited OP20 methods, so safe frontend reuse requires composition with the generated `OP20Abi`, not a blind one-file swap
- Generated factory events differ too (`TokenRegistered` vs handwritten `TokenDeployed`)

### WASM Artifact — Sync Gap

- Contract builds to `contracts/build/LaunchToken.wasm`
- Manual `npm run copy:wasm` copies to `frontend/public/contracts/LaunchToken.wasm`
- Frontend build (`tsc -b && vite build`) never triggers contract build
- CI runs contracts and frontend as **parallel jobs on separate runners** — no artifact sharing
- WASM is checked into git and served statically from `/contracts/LaunchToken.wasm`

### Test Fixtures — Stale

`shared/constants/test-vectors.ts` uses the **old constant-product formula** (`virtualBtcReserve`, `virtualTokenSupply`, `k`). The current contract uses an **exponential curve** (`currentSupplyOnCurve`, `aScaled`, `bScaled`). These vectors test a curve that no longer exists.

`shared/__tests__/constants.test.ts` is also stale: it still asserts removed constant-product symbols such as `INITIAL_VIRTUAL_BTC_SATS` and outdated allocation caps. Artifact-drift work must clean up stale fixtures broadly, not just one vector file.

### CI/CD — No Cross-Layer Validation

- `ci.yml` has parallel jobs with no artifact dependency chain. It also still targets a stale `backend/` package path rather than the `netlify/` package that contains the function-layer math/indexer code relevant to this feature.
- No WASM hash check, no ABI composition/consumption check, and no current-curve cross-layer conformance job exist today.
- `deploy.yml`: frontend deploy runs `npm run build` but never builds contracts first.
- `frontend/netlify.toml` build command runs `netlify` + `frontend` installs/builds but never builds contracts first.

### Indexer Reconciliation

The reconciliation path in `indexer-core.mts:347-401` recomputes reserves from the integral `calculateBuyCost(a, b, 0, newSupply)` using the backend BigInt math. This is correct as long as the function-layer math remains semantically aligned with the contract. The reconciliation itself is sound; the visible snap came from optimistic prices being computed with different frontend float math and, for new deployments, from stale bytecode/ABI artifacts.

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canonical TS math location | `shared/lib/bonding-curve.ts` + `shared/lib/exp-math.ts` as the JS/TS source of truth, with a generated/synced Netlify-local mirror only if direct shared imports prove incompatible with Netlify bundling | Aligns with the spec and the repo's existing Netlify cross-directory import caveat. |
| Frontend ABI source | Thin frontend wrapper over generated contract ABIs, composed from `contracts/abis/LaunchToken.abi.ts`, `contracts/abis/OP20.abi.ts`, and `contracts/abis/OPumpFactory.abi.ts` | Generated artifacts replace handwritten ABI arrays, while the wrapper preserves frontend typing and handles inherited OP20 methods. |
| WASM sync mechanism | Contract build emits the deployable WASM plus manifest; frontend build/dev consume that artifact automatically | Eliminates manual steps and supports cache-busting/checksum validation. |
| CI enforcement | Add `artifact-check` job and gate the actual `frontend` + `netlify` validation jobs on it | Validates WASM SHA, ABI consumption/composition, and current-curve conformance before merge. |
| Test vectors | Rewrite current-curve fixtures and remove or isolate stale constant-product tests | Prevents obsolete fixtures from silently validating the wrong model. |

# Implementation Plan: Fix "Method Not Found" on Token Registration

**Branch**: `17-fix-register-token-selector` | **Date**: 2026-03-25 | **Spec**: specs/17-fix-register-token-selector/spec.md

## Summary

Token registration fails with "Method not found: 2822811599" because the deployed factory bytecode is stale. Fix: clean redeploy of OPumpFactory, update the factory address, fix deploy script bugs, and add user-friendly error messages for contract call failures.

## Technical Context

**Language/Version**: TypeScript (frontend), AssemblyScript (contracts)
**Primary Dependencies**: React 18, Vite, opnet SDK, @btc-vision/btc-runtime, @btc-vision/transaction
**Storage**: On-chain (OPNet contracts), Upstash Redis (API)
**Testing**: Manual E2E (connect wallet → create token → verify on-chain)
**Target Platform**: Web (SPA)
**Project Type**: Web application (frontend + contracts + serverless API)
**Performance Goals**: Token creation completes within one user interaction (no multi-step waits beyond mempool broadcast)
**Constraints**: Mempool-first architecture — UI updates immediately on broadcast, no block confirmation gating

## Constitution Check

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| 1 | SafeMath for all u256 ops | PASS | No contract changes in this fix |
| 2 | Frontend never holds signing keys | PASS | OPWallet handles all signing |
| 3 | API responses follow shared types | PASS | No API changes |
| 4 | Mempool-first UI updates | PASS | Existing retry loop respects mempool timing |

No violations.

## Changes Required

### Phase A — Infrastructure Fix (Already Done)

These were completed during the clarification session:

| # | File | Change | Status |
|---|------|--------|--------|
| A1 | `contracts/build/*` | Clean rebuild of all contracts | DONE |
| A2 | On-chain | Redeployed OPumpFactory to `opt1sqqvc007ncgfp64zjqctx8pfyk5a2e5hc6qfj7q9u` | DONE |
| A3 | `frontend/.env` | Updated `VITE_FACTORY_ADDRESS` to new address | DONE |
| A4 | `contracts/scripts/deploy.mjs` | Fixed `.txid` → `.result` for TX ID logging | DONE |
| A5 | `contracts/scripts/deploy.mjs` | Fixed post-deploy instructions (backend → frontend) | DONE |

### Phase B — Error UX Improvement (FR-004)

| # | File | Change |
|---|------|--------|
| B1 | `frontend/src/components/launch/steps/StepDeploy.tsx` | Parse contract errors in catch block and show user-friendly messages |

#### B1 Detail: StepDeploy Error Parsing

**Location**: `StepDeploy.tsx:181-184` (the catch block in `handleDeploy`)

**Current code**:
```tsx
} catch (err) {
  toast.error(err instanceof Error ? err.message : 'Deployment failed');
  abortDeploy();
}
```

**New code** — add a helper to categorize contract errors:

```tsx
function getDeployErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Method not found')) {
    return 'Factory contract is unavailable or outdated. Please contact support.';
  }
  if (msg.includes('Contract reverted')) {
    return msg; // Already user-friendly from sendContractCall
  }
  if (msg.includes('No UTXOs')) {
    return 'Insufficient funds. Please add BTC to your wallet.';
  }
  if (msg.includes('OPWallet not found')) {
    return 'OPWallet extension not detected. Please install it and refresh.';
  }
  return msg;
}
```

Then in the catch block:
```tsx
} catch (err) {
  toast.error(getDeployErrorMessage(err));
  abortDeploy();
}
```

### Phase C — Verification

| # | Action | Method |
|---|--------|--------|
| C1 | Verify factory responds to `getTokenCount()` | Call via frontend or RPC — should return 0 (fresh deploy) |
| C2 | Test full token creation flow | Connect wallet → fill form → deploy → verify no "Method not found" |
| C3 | Verify error messages | Temporarily set a bad factory address → confirm user-friendly toast |

## Files Modified

| File | Type | Phase |
|------|------|-------|
| `contracts/scripts/deploy.mjs` | Bug fix | A |
| `frontend/.env` | Config | A |
| `frontend/src/components/launch/steps/StepDeploy.tsx` | Enhancement | B |

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| New factory address has no UTXOs for gas | Low | Deploy script verified 1 UTXO (1.9M sats) at deployer address |
| Deployment not confirmed by time user tests | Medium | Wait for 1 block (~10 min on testnet); or verify via `getTokenCount()` RPC call |
| OPWallet caches old factory address | Low | User must refresh page after `.env` change; Vite injects env at build time |

## Out of Scope

- Double-submit prevention (edge case from spec — deferred)
- Factory upgrade mechanism
- On-chain volume/graduation counter updates (tracked off-chain by indexer per contract comment)

# Implementation Plan: Token Confirmation Gating

**Branch**: `18-token-confirmation-gating` | **Date**: 2026-03-26 | **Spec**: specs/18-token-confirmation-gating/spec.md

## Summary

Gate trading on unconfirmed tokens (`deployBlock === 0`) across frontend and backend, add a Phase 4 confirmation-waiting step to the deploy flow, and update the indexer to set `deployBlock` when the deploy TX is mined.

## Technical Context

**Language/Version**: TypeScript (Node 24+)
**Primary Dependencies**: React 18, Zustand, Vite, TailwindCSS, opnet SDK, Upstash Redis
**Storage**: Upstash Redis (existing token hashes)
**Testing**: Manual E2E on testnet
**Target Platform**: Web (SPA + Netlify Functions)
**Constraints**: No new DB fields — `deployBlock: 0` is the source of truth

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| 1. SafeMath for contract math | N/A | No contract changes |
| 2. Frontend never holds keys | OK | No signing changes |
| 3. API follows shared types | OK | No new API fields |
| 4. Mempool-first | **Justified exception** | Token is shown immediately in lists (mempool-first for display). Trading is gated on contract existence, not on confirmation count. See research.md R1. |

---

## Changes by Layer

### 1. Frontend — Deploy Flow Phase 4

**File**: `frontend/src/stores/launch-store.ts`
- Add 4th entry to `DEPLOY_PHASES` array: `{ label: 'Waiting for on-chain confirmation...', status: 'pending' }`

**File**: `frontend/src/components/launch/steps/StepDeploy.tsx`
- After Phase 3 (metadata save), call `advanceDeployPhase(3)` to activate Phase 4
- Start polling via `waitForConfirmation(deployTxHash)` (no timeout — poll indefinitely)
- While Phase 4 is active:
  - Show Phase 4 spinner with text: "Bitcoin blocks take ~10 minutes. You can wait here or view your pending token."
  - Show a "View Token (Pending)" link: `navigate(\`/token/${contractAddress}\`)`
- On confirmation: set `deployedAddress` → shows the existing success screen
- Remove the `timeoutMs` parameter from `waitForConfirmation` call (or pass `Infinity`)

**File**: `frontend/src/services/contract.ts`
- Make `waitForConfirmation` timeout optional: default to `Infinity` instead of 900_000

### 2. Frontend — Token Pending State

**File**: `frontend/src/components/token/TokenBadge.tsx`
- Add helper: `export function isTokenPending(token: { deployBlock?: number }): boolean { return !token.deployBlock; }`
- Add case before the default: if `isTokenPending(token)` → render `<Badge variant="warning">Pending</Badge>`

**File**: `frontend/src/pages/TokenPage.tsx`
- Import `isTokenPending` from TokenBadge
- Where TradePanel is rendered (line ~231): add a check — if `isTokenPending(token)`, show a pending message card instead of TradePanel:
  ```
  "This token is waiting for on-chain confirmation. Trading will be available once the deployment transaction is confirmed."
  ```
- Add polling: when `isTokenPending(token)` is true, set up an interval (10s) that re-fetches the token. Clear interval when `deployBlock > 0` or on unmount.

**File**: `frontend/src/pages/FieldsPage.tsx` (or `TrenchColumn` component)
- No filtering changes needed — pending tokens already appear in lists
- The `TokenBadge` change handles the visual indicator automatically since TokenBadge is rendered per token row

### 3. Backend — Reject Trades on Unconfirmed Tokens

**File**: `netlify/functions/trades-submit.mts`
- After the existing `getToken()` + graduated check (~line 62), add:
  ```typescript
  if (preCheck && (!preCheck.deployBlock || preCheck.deployBlock === 0)) {
    return error("Token not yet confirmed on-chain. Trading opens after confirmation.", 400, "NotConfirmed");
  }
  ```

### 4. Backend — Indexer Updates `deployBlock`

**File**: `netlify/functions/_shared/indexer-core.mts`
- In the block where `TokenDeployed` factory events are processed (after adding to `knownTokenAddresses`):
  - Look up the token in Redis via `getToken(tokenAddr)`
  - If found and `deployBlock === 0`: call `updateToken(tokenAddr, { deployBlock: blockNum })`
  - Log: `[Indexer] Confirmed token ${tokenAddr} at block ${blockNum}`

**File**: `netlify/functions/_shared/redis-queries.mts`
- Verify `updateToken()` (or equivalent) can update `deployBlock` on an existing token hash. If no generic update function exists, add a targeted `confirmTokenDeploy(address, blockNum)` that does `HSET op:token:{address} deployBlock {blockNum}`.

---

## File Change Summary

| File | Change | FR |
|------|--------|----|
| `frontend/src/stores/launch-store.ts` | Add Phase 4 to DEPLOY_PHASES | FR-001 |
| `frontend/src/components/launch/steps/StepDeploy.tsx` | Phase 4 polling + "View Token (Pending)" link | FR-001, FR-007 |
| `frontend/src/services/contract.ts` | Make waitForConfirmation timeout optional | FR-001 |
| `frontend/src/components/token/TokenBadge.tsx` | Add pending state + `isTokenPending` helper | FR-002 |
| `frontend/src/pages/TokenPage.tsx` | Gate TradePanel on pending, add polling | FR-003, FR-006 |
| `netlify/functions/trades-submit.mts` | Reject trades for deployBlock === 0 | FR-004 |
| `netlify/functions/_shared/indexer-core.mts` | Update deployBlock on TokenDeployed event | FR-005 |
| `netlify/functions/_shared/redis-queries.mts` | Add/verify deployBlock update function | FR-005 |

## Verification

1. **Deploy a token** via the UI on testnet
2. After Phase 3, verify Phase 4 shows "Waiting for on-chain confirmation" with spinner
3. Verify "View Token (Pending)" link navigates to token page
4. On token page: verify "Pending" badge, no trade panel, pending message shown
5. On Fields page: verify token appears with "Pending" badge
6. Use curl to POST a trade to the API for the pending token — verify 400 rejection
7. Wait for block confirmation. Trigger indexer (`POST /api/v1/indexer/run`)
8. Verify token page transitions to Active with trade panel (via polling, no refresh)
9. On deploy page (if still open): verify success screen appears

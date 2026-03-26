# Tasks: Token Confirmation Gating

**Branch**: `18-token-confirmation-gating`
**Generated**: 2026-03-26

## Dependency Graph

```
Phase 1 (Setup)
  └─► Phase 2 (Foundational)
        ├─► Phase 3 (US1 — Deploy Phase 4)      ─┐
        ├─► Phase 4 (US2 — Pending UI)           ─┤─► Phase 6 (Polish)
        ├─► Phase 5 (US3 — Backend rejection)    ─┤
        └─► Phase 5 (US4 — Indexer confirmation) ─┘
```

Phases 3–5 can run in parallel after Phase 2.

---

## Phase 1: Setup

- [x] T001 Read the full plan at `specs/18-token-confirmation-gating/plan.md` and verify the 8 target files exist and match expected state

## Phase 2: Foundational

These changes are prerequisites used by multiple user stories.

- [x] T002 [P] Add `isTokenPending` helper to `frontend/src/components/token/TokenBadge.tsx` — export `function isTokenPending(token: { deployBlock?: number }): boolean` that returns `true` when `deployBlock` is falsy or 0. Add a case in the badge render: if pending, return `<Badge variant="warning">Pending</Badge>` (before the default `Active` case)
- [x] T003 [P] Make `waitForConfirmation` timeout optional in `frontend/src/services/contract.ts` — change default `timeoutMs` from `900_000` to `Infinity` so callers can poll indefinitely. Existing callers that passed an explicit timeout are unaffected
- [x] T004 [P] Add or verify a `confirmTokenDeploy` function in `netlify/functions/_shared/redis-queries.mts` — it should accept `(contractAddress: string, blockNum: number)` and run `HSET op:token:{contractAddress} deployBlock {blockNum}`. If a generic `updateToken` already handles this, just verify and export it

## Phase 3: User Story 1 — Creator waits for confirmation after deploy (P1)

**Goal**: After broadcasting, show Phase 4 "Waiting for confirmation" with polling. Creator can navigate away or wait for success.

- [x] T005 [US1] Add Phase 4 to `DEPLOY_PHASES` in `frontend/src/stores/launch-store.ts` — append `{ label: 'Waiting for on-chain confirmation...', status: 'pending' }` as the 4th entry
- [x] T006 [US1] Update `frontend/src/components/launch/steps/StepDeploy.tsx` — after Phase 3 (metadata save) succeeds, call `advanceDeployPhase(3)` to activate Phase 4. Then call `waitForConfirmation(deployTxHash)` (imported from `@/services/contract`). On resolution, call `setDeployedAddress(contractAddress)` to trigger the success screen. Wrap in try/catch so errors show a toast but don't block
- [x] T007 [US1] Add Phase 4 UI to `frontend/src/components/launch/steps/StepDeploy.tsx` — when Phase 4 is active (phase index 3 is `'active'`) and `!deployedAddress`, show below the phases list: (a) helper text "Bitcoin blocks take ~10 minutes. You can wait here or view your pending token." and (b) a "View Token (Pending)" link button that calls `navigate(\`/token/${contractAddress}\`)`. Use the `contractAddress` variable already available from Phase 1

## Phase 4: User Story 2 — Unconfirmed tokens visible but non-tradeable (P1)

**Goal**: Pending badge on all pages, trade panel hidden, polling on token detail page.

- [x] T008 [US2] Gate the trade panel in `frontend/src/pages/TokenPage.tsx` — import `isTokenPending` from `@/components/token/TokenBadge`. In the conditional render block (~line 231), add a check before `<TradePanel>`: if `isTokenPending(token)`, render a card with `Loader2` icon and text "This token is waiting for on-chain confirmation. Trading will be available once the deployment transaction is confirmed." styled consistently with the existing `MigrationCard`
- [x] T009 [US2] Add confirmation polling to `frontend/src/pages/TokenPage.tsx` — when `isTokenPending(token)` is true, set up a `setInterval` (10 seconds) that calls `fetchToken(address)` to re-fetch token data. Clear the interval when `deployBlock > 0` or on component unmount. Use a `useEffect` keyed on `token?.deployBlock` and `address`

## Phase 5: User Story 3 + 4 — Backend rejection + Indexer confirmation (P1 + P2)

**Goal**: Backend rejects trades on unconfirmed tokens; indexer sets `deployBlock` on confirmation.

- [x] T010 [P] [US3] Add `deployBlock` check in `netlify/functions/trades-submit.mts` — after the existing `getToken()` + graduated status check (~line 62), add: if `preCheck` exists and `(!preCheck.deployBlock || preCheck.deployBlock === 0)`, return `error("Token not yet confirmed on-chain. Trading opens after confirmation.", 400, "NotConfirmed")`
- [x] T011 [P] [US4] Update the indexer in `netlify/functions/_shared/indexer-core.mts` — in the block where `TokenDeployed` factory events are processed (after adding to `knownTokenAddresses`), call `getToken(tokenAddr)`. If the token exists in Redis and its `deployBlock` is 0, call `confirmTokenDeploy(tokenAddr, blockNum)` (from T004). Log `[Indexer] Confirmed token ${tokenAddr} at block ${blockNum}`

## Phase 6: Polish

- [x] T012 Manually test the full flow on testnet: deploy a token → verify Phase 4 shows → click "View Token (Pending)" → verify pending badge + no trade panel → wait for block → trigger indexer → verify token transitions to Active with trade panel. Verify curl trade submission against pending token returns 400

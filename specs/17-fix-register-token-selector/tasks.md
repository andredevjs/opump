# Tasks: Fix "Method Not Found" on Token Registration

**Branch**: `17-fix-register-token-selector`
**Generated**: 2026-03-25
**Total tasks**: 8 (6 done, 2 remaining — verification only)

---

## Phase 1: Infrastructure Fix (FR-001, FR-002, FR-003) — DONE

> All tasks completed during clarification session.

- [x] T001 [US1] Clean rebuild all contracts: `cd contracts && npm run clean && npm run build:all` — verify selector `0xa840afcf` in build output
- [x] T002 [US1] Redeploy OPumpFactory to testnet: `source scripts/.env && MNEMONIC="$MNEMONIC" node scripts/deploy.mjs` from `contracts/` — record new contract address
- [x] T003 [US1] Update `VITE_FACTORY_ADDRESS` in `frontend/.env` to new factory address from T002
- [x] T004 [P] Fix deploy script TX ID logging in `contracts/scripts/deploy.mjs` — change `.txid` to `.result` on lines that log funding and reveal TX IDs (4 occurrences)
- [x] T005 [P] Fix deploy script post-deploy instructions in `contracts/scripts/deploy.mjs` — change `backend/.env: FACTORY_ADDRESS` to `frontend/.env: VITE_FACTORY_ADDRESS`

## Phase 2: Error UX Improvement (FR-004)

> User Story 2: Clear error messages on misconfigured factory.

- [x] T006 [US2] Add `getDeployErrorMessage()` helper function in `frontend/src/components/launch/steps/StepDeploy.tsx` that maps raw contract errors to user-friendly messages. Handle these cases: "Method not found" → factory unavailable; "No UTXOs" → insufficient funds; "OPWallet not found" → extension missing. Pass through `Contract reverted:` messages as-is. Replace the catch block at line ~181 to use this helper instead of raw `err.message`.

## Phase 3: Verification

> Manual E2E checks — no automated tests.

- [ ] T007 [US1] Verify factory deployment by calling `getTokenCount()` on the new factory address (`opt1sqp9zgdmp3pjhqgrgvac26k5egq84jz5l2c4a3tzn`) via RPC — should return 0 (fresh deploy). Deployment broadcast confirmed (Funding TX: `246f1169...`, Reveal TX: `cff5b718...`). Awaiting block confirmation (~10 min on testnet).
- [ ] T008 [US2] Verify error messages by temporarily setting `VITE_FACTORY_ADDRESS` to an invalid address in `frontend/.env`, running the frontend, and attempting token creation — confirm the toast shows the friendly "Factory contract is unavailable" message instead of a raw stack trace. Restore the correct address afterward.

---

## Dependency Graph

```
T001 → T002 → T003 → T007
T004, T005 (parallel, no deps)
T006 → T008
```

## Summary

| Phase | Tasks | Done | Remaining |
|-------|-------|------|-----------|
| 1: Infrastructure Fix | 5 | 5 | 0 |
| 2: Error UX | 1 | 1 | 0 |
| 3: Verification | 2 | 0 | 2 |
| **Total** | **8** | **5** | **3** |

**MVP scope**: Phase 1 only (already done) — the core bug is fixed. Phase 2 is polish.

**Parallel opportunities**: T004 and T005 were independent of each other (already done). T007 and T006 can run in parallel since they touch different concerns.

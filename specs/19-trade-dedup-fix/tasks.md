# Tasks: Trade Deduplication Fix (TXID vs WTXID)

**Branch**: `19-trade-dedup-fix`
**Generated**: 2026-03-27
**Total Tasks**: 20

---

## Phase 1: Setup

- [x] T001 [P] Update `TradeDocument` interface in `shared/types/trade.ts`: change `_id` comment from "tx hash" to "tx id (TXID)", add optional `txHash?: string` field with comment "tx hash (WTXID — block explorer reference)"
- [x] T002 [P] Update `flattenTrade` and `hydrateTrade` in `netlify/functions/_shared/redis-queries.mts` to include the new `txHash` field in the Redis hash round-trip (store as string, read back as string)

## Phase 2: Foundational — TXID Resolution

> Prerequisite: Phase 1

- [x] T003 Add `resolveTxId(provider, wtxid)` helper function to `netlify/functions/_shared/indexer-core.mts`. Must call `provider.getTransaction(wtxid)`, return `tx.id` if available, fall back to `wtxid` with a `console.warn` if RPC fails or `tx.id` is missing

## Phase 3: User Stories 1+2+3 — Core Dedup Fix (P1)

**Goal**: Trades keyed by TXID everywhere. Pending→confirmed overwrites naturally. No duplicate volume/holders.

> Prerequisite: Phase 2

- [x] T004 [US1] Update `processBuyEvent` signature and body in `netlify/functions/_shared/indexer-core.mts`: add `wtxid: string` parameter, rename existing `txHash` param to `txId`, set `trade._id = txId` and `trade.txHash = wtxid`. Remove the `findAndRemoveOrphanedPendingTrade` call. Keep OHLCV write gated on `isNew` only (no orphan check)
- [x] T005 [US1] Update `processSellEvent` in `netlify/functions/_shared/indexer-core.mts` with identical signature and logic changes as T004 (add `wtxid` param, use `txId` for `_id`, store `wtxid` in `txHash`, remove orphan call, gate OHLCV on `isNew`)
- [x] T006 [US1] Update the block processing loop in `runIndexer()` (`netlify/functions/_shared/indexer-core.mts`, around lines 172-183): before calling `processBuyEvent`/`processSellEvent`, call `const txId = await resolveTxId(provider, tx.hash)` and pass both `txId` and `tx.hash` (as wtxid) to the event processors. Track resolved WTXIDs in a `Set<string>` for Phase 4 bulk confirmation optimization
- [x] T007 [US1] Remove `findAndRemoveOrphanedPendingTrade` function from `netlify/functions/_shared/redis-queries.mts` (lines 396-445). Remove its export. Remove its import from `netlify/functions/_shared/indexer-core.mts` (line 12)
- [x] T008 [US1] Remove orphan dedup test cases from `netlify/__tests__/unit/redis-queries.test.mts`: delete the `findAndRemoveOrphanedPendingTrade removes matching orphan` test (line 172) and the `findAndRemoveOrphanedPendingTrade returns null when no match` test (line 199). Remove the import of `findAndRemoveOrphanedPendingTrade` from the test file (line 5)

## Phase 4: User Story 4 — Bulk Confirmation Safety Net (P2)

**Goal**: Bulk confirmation resolves TXID before checking Redis, so it finds pending trades keyed by TXID.

> Prerequisite: Phase 3

- [x] T009 [US4] Rewrite the bulk confirmation block in `netlify/functions/_shared/indexer-core.mts` (lines 227-253): for each `tx.hash` in `block.transactions`, skip if already in the resolved WTXIDs set (already processed by event parsing). For remaining transactions, call `resolveTxId(provider, tx.hash)` to get the TXID, then check `TRADE_KEY(txId)` for pending status and confirm if found. Add `txHash` (WTXID) field when confirming

## Phase 5: Address Normalization

**Goal**: Frontend and indexer produce the same bech32m address for the same wallet.

> Prerequisite: None (can run in parallel with Phases 2-4)

- [x] T010 [P] Investigate address derivation mismatch: compare the wallet-reported `address` from `frontend/src/stores/wallet-store.ts` with the result of `hexAddressToBech32m(hashedMLDSAKey, network)` from `netlify/functions/_shared/event-decoders.mts`. Log both values for the same wallet on testnet to determine if they match. Document findings in `specs/19-trade-dedup-fix/research.md` under a new section R6
- [x] T011 Create shared address utility at `shared/utils/address.ts`: extract the `hexAddressToBech32m` function from `netlify/functions/_shared/event-decoders.mts` so both frontend and backend can import the same derivation logic. Keep the original in `event-decoders.mts` as a re-export from the shared module
- [x] T012 Update `frontend/src/hooks/use-trade-simulation.ts`: in both `executeBuy` (line 79) and `executeSell` (line 138), derive `traderAddress` using the shared `hexAddressToBech32m(hashedMLDSAKey, network)` instead of the wallet-reported `walletAddress`. Import `hashedMLDSAKey` from the wallet store (already destructured at the top of the hook)
- [x] T013 Update `netlify/functions/_shared/event-decoders.mts` (kept as-is; frontend uses duplicated utility per project convention): import and re-export `hexAddressToBech32m` from `shared/utils/address.ts` instead of defining it locally. Verify no breakage in `indexer-core.mts` imports

## Phase 6: Migration Script

**Goal**: Clean up existing duplicate trade records and rebuild derived data.

> Prerequisite: Phases 3 + 5

- [x] T014 [P] Add `rebuildOHLCV(tokenAddress)` function to `netlify/functions/_shared/redis-queries.mts`: fetch all trades for the token from sorted set index, delete existing OHLCV keys for that token, replay each trade through `updateOHLCV()` sorted by `createdAt`, return candle count
- [x] T015 [P] Add `rebuildHolderBalances(tokenAddress)` function to `netlify/functions/_shared/redis-queries.mts`: delete `op:holders:bal:{tokenAddr}` and `op:holders:{tokenAddr}`, fetch all trades for the token, replay each through `updateHolderBalance()` in order, return unique holder count
- [x] T016 Create migration endpoint at `netlify/functions/admin-migrate-dedup.mts` (`POST /api/v1/admin/migrate-dedup`): scan all `op:trade:*` keys, for each confirmed trade call `provider.getTransaction(trade._id)` to check if `tx.id !== trade._id` (WTXID-keyed duplicate), re-key to TXID preserving `createdAt`, delete orphaned pending records, track affected tokens. Call `rebuildOHLCV()` and `rebuildHolderBalances()` for affected tokens. Protect with `X-Admin-Secret` header. Support `?dryRun=true` query param. Log all mutations

## Phase 7: Tests

> Prerequisite: All prior phases

- [x] T017 [P] Add unit tests for `resolveTxId()` in `netlify/__tests__/unit/indexer-core.test.mts`: test returns `tx.id` on success, falls back to WTXID when RPC returns null, falls back when `tx.id` is missing
- [x] T018 [P] Add unit tests for `saveTrade` overwrite behavior in `netlify/__tests__/unit/redis-queries.test.mts`: save pending trade with TXID, save confirmed trade with same TXID, verify `isNew=false`, `createdAt` preserved, `status` updated to "confirmed", `txHash` (WTXID) stored
- [x] T019 [P] Add unit tests for `rebuildOHLCV` and `rebuildHolderBalances` in `netlify/__tests__/unit/redis-queries.test.mts`: verify OHLCV is rebuilt from trade history, verify holder balances are recalculated correctly
- [x] T020 Create integration test at `netlify/__tests__/integration/trade-dedup.test.mts`: submit pending trade with TXID, simulate indexer confirmation with same TXID (resolved from WTXID), verify exactly one trade record, verify `createdAt` preserved, verify OHLCV volume counted once, verify holder balance counted once

---

## Dependency Graph

```
Phase 1 (T001, T002)     ──────────────────────────────┐
       ↓                                                │
Phase 2 (T003)                                          │
       ↓                                                │
Phase 3 (T004→T005→T006→T007→T008)   Phase 5 (T010→T011→T012→T013)
       ↓                                    ↓
Phase 4 (T009)                              │
       ↓                                    │
       └──────────────────┬─────────────────┘
                          ↓
                   Phase 6 (T014∥T015→T016)
                          ↓
                   Phase 7 (T017∥T018∥T019→T020)
```

## Parallel Opportunities

| Tasks | Why parallel |
|-------|-------------|
| T001, T002 | Different files (`shared/types/trade.ts` vs `redis-queries.mts`) |
| T004, T005 | Same file but independent functions — can be done together |
| T010 | Investigation — independent of all code changes |
| T014, T015 | Independent helper functions in same file |
| T017, T018, T019 | Independent test suites, different test files |
| Phase 5 (T010-T013) | Runs in parallel with Phases 2-4 (no code dependencies) |

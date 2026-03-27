# Implementation Plan: Trade Deduplication Fix (TXID vs WTXID)

**Branch**: `19-trade-dedup-fix` | **Date**: 2026-03-27 | **Spec**: `specs/19-trade-dedup-fix/spec.md`

## Summary

The indexer currently keys confirmed trades by WTXID (`tx.hash`) while the frontend keys pending trades by TXID (broadcast hash). This creates duplicate records. The fix switches the indexer to use TXID as the canonical `_id` by resolving it via `provider.getTransaction(tx.hash).id`, removes the now-unnecessary orphan dedup logic, normalizes trader address derivation, and includes a migration to clean up existing duplicates.

## Technical Context

**Language/Version**: TypeScript (ES2022 target, Node 20+)
**Primary Dependencies**: `opnet` (RPC provider), `@btc-vision/bitcoin` (address encoding), Upstash Redis
**Storage**: Upstash Redis (hashes + sorted sets)
**Testing**: Vitest (unit + integration tests in `netlify/__tests__/`)
**Target Platform**: Netlify Functions (serverless)
**Project Type**: Web application (existing monorepo)
**Performance Goals**: Indexer processes blocks in <10s. Extra `getTransaction()` calls only for trade events (typically 0-5 per block).
**Constraints**: Netlify Function 10s timeout for scheduled indexer; RPC rate limits on OPNet testnet.

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | No contract changes |
| Frontend never holds signing keys | PASS | No frontend signing changes |
| API responses follow shared types | PASS | TradeDocument updated in `shared/types/trade.ts` |
| Mempool-first | PASS | Pending trades still saved immediately on broadcast. No confirmation gating added |

## Phase 1: Core Indexer Fix

### 1.1 Add TXID resolution helper to indexer-core.mts

**File**: `netlify/functions/_shared/indexer-core.mts`

Add a helper function that resolves a TXID from a WTXID using the RPC provider:

```typescript
async function resolveTxId(provider: JSONRpcProvider, wtxid: string): Promise<string> {
  const tx = await provider.getTransaction(wtxid);
  if (!tx || !tx.id) {
    console.warn(`[Indexer] Could not resolve TXID for ${wtxid}, falling back to WTXID`);
    return wtxid; // Graceful fallback
  }
  return tx.id;
}
```

**Rationale**: Centralized resolution with fallback. If the RPC call fails, the WTXID is used as fallback — this is safe because `saveTrade()` will create a new record that can be cleaned up later. Better than crashing the indexer.

### 1.2 Update processBuyEvent and processSellEvent

**File**: `netlify/functions/_shared/indexer-core.mts`

**Changes to both functions:**

1. Add `wtxid: string` parameter alongside existing `txHash` parameter
2. Rename `txHash` parameter to `txId` for clarity
3. Set `trade._id = txId` (TXID, not WTXID)
4. Set `trade.txHash = wtxid` (WTXID, stored as secondary field)
5. **Remove** the `findAndRemoveOrphanedPendingTrade()` call and its `isNew`-gated block
6. Keep OHLCV write, but only when `isNew` (same as before — `saveTrade()` returns `isNew: false` when overwriting a pending record, so OHLCV is not double-written)

**Updated call sites** (in the block processing loop):
```typescript
// Before:
await processBuyEvent(contractAddr, tx.hash, ...)

// After:
const txId = await resolveTxId(provider, tx.hash);
await processBuyEvent(contractAddr, txId, tx.hash, ...)
```

**OHLCV logic after orphan removal:**
- When `isNew = true`: Write OHLCV (new trade, no pending version existed)
- When `isNew = false`: Skip OHLCV (pending version already wrote it via trades-submit)
- This is simpler and correct without the orphan check

### 1.3 Update bulk confirmation safety net

**File**: `netlify/functions/_shared/indexer-core.mts` (lines 227-253)

The bulk confirmation currently checks `TRADE_KEY(tx.hash)` (WTXID). Since pending trades are keyed by TXID, this never matches. Fix:

1. For each `tx.hash` in `block.transactions`, resolve the TXID via `resolveTxId()`
2. Check `TRADE_KEY(txId)` instead of `TRADE_KEY(tx.hash)`
3. If status is "pending", confirm it

**Optimization**: Batch the `getTransaction()` calls or skip resolution for transactions already processed by event parsing. Track a `Set<string>` of already-processed WTXIDs in the block loop and skip them in bulk confirmation.

### 1.4 Update TradeDocument interface

**File**: `shared/types/trade.ts`

```typescript
export interface TradeDocument {
  _id: string;              // tx id (TXID — primary key)
  txHash?: string;          // tx hash (WTXID — for block explorer reference)
  // ... rest unchanged
}
```

Update the JSDoc comment on `_id` from "tx hash" to "tx id (TXID)".

### 1.5 Update flattenTrade / hydrateTrade in redis-queries.mts

**File**: `netlify/functions/_shared/redis-queries.mts`

Ensure the `txHash` field is included in the flatten/hydrate round-trip so it's stored in and read from Redis.

## Phase 2: Remove Orphan Dedup Logic

### 2.1 Delete findAndRemoveOrphanedPendingTrade

**File**: `netlify/functions/_shared/redis-queries.mts`

Remove the function (lines 396-445) entirely.

### 2.2 Remove imports and call sites

**Files**:
- `netlify/functions/_shared/indexer-core.mts` — Remove import and both call sites (processBuyEvent line 324, processSellEvent line 375)
- `netlify/functions/_shared/redis-queries.mts` — Remove export

### 2.3 Remove orphan dedup tests

**File**: `netlify/__tests__/unit/redis-queries.test.mts`

Remove the two test cases:
- `findAndRemoveOrphanedPendingTrade removes matching orphan` (line 172)
- `findAndRemoveOrphanedPendingTrade returns null when no match` (line 199)

## Phase 3: Address Normalization

### 3.1 Investigate address derivation mismatch

**Files to compare**:
- Frontend: `frontend/src/stores/wallet-store.ts` — `address` field from `syncWallet()`
- Indexer: `netlify/functions/_shared/event-decoders.mts` — `hexAddressToBech32m()`

**Task**: Determine if the wallet's reported address matches `hexAddressToBech32m(hashedMLDSAKey, network)`. If yes, the frontend can use the same derivation. If not, investigate which parameters differ.

### 3.2 Normalize frontend trade submission address

**File**: `frontend/src/hooks/use-trade-simulation.ts`

If the addresses don't match natively, convert the `traderAddress` before submitting to the API. Two options:

**Option A** — Frontend derives address using same logic as indexer:
```typescript
import { hexAddressToBech32m } from '@/utils/address'; // shared helper
traderAddress: hexAddressToBech32m(hashedMLDSAKey, network)
```

**Option B** — Backend normalizes on receipt in `trades-submit.mts`:
The backend could convert the submitted address to the canonical form. But this requires the backend to know the hex key, which isn't in the request body.

**Preferred**: Option A. The wallet store already has `hashedMLDSAKey`. Extract the `hexAddressToBech32m` logic into a shared utility or replicate the `toBech32` call in the frontend.

### 3.3 Shared address utility

**File**: `shared/utils/address.ts` (new file — justified: shared between frontend and backend)

Extract the `hexAddressToBech32m` function so both frontend and backend use the same derivation. The function depends on `toBech32` from `@btc-vision/bitcoin` which is available in both environments.

## Phase 4: Migration Script

### 4.1 Create migration endpoint

**File**: `netlify/functions/admin-migrate-dedup.mts` (new)

A one-time admin endpoint (`POST /api/v1/admin/migrate-dedup`) that:

1. **Scan**: Iterate all trade keys (`op:trade:*`) using Redis SCAN
2. **Identify duplicates**: For each confirmed trade, call `provider.getTransaction(trade._id)`:
   - If `tx.id !== trade._id`, this trade is keyed by WTXID (duplicate)
   - Check if a pending trade exists at `TRADE_KEY(tx.id)` (the TXID)
3. **Re-key**:
   - Copy confirmed trade data to `TRADE_KEY(tx.id)`, preserving `createdAt` from the pending record if it exists
   - Add `txHash: trade._id` (the WTXID) to the re-keyed record
   - Delete the old WTXID-keyed record
   - Update sorted set indexes (remove old member, add new)
   - Delete the orphaned pending record if it exists
4. **Track affected tokens**: Collect all `tokenAddress` values that had duplicates
5. **Recalculate OHLCV**: For each affected token, delete existing OHLCV keys and rebuild from remaining trades
6. **Recalculate holder balances**: For each affected token, wipe holder balance sorted sets and replay all trades

**Safety**:
- Protected by an admin secret header (`X-Admin-Secret`)
- Dry-run mode (`?dryRun=true`) that reports what would change without modifying data
- Logs every mutation for audit trail
- Idempotent — safe to run multiple times

### 4.2 OHLCV rebuild helper

**File**: `netlify/functions/_shared/redis-queries.mts`

Add a function to rebuild OHLCV for a token from its trade history:

```typescript
export async function rebuildOHLCV(tokenAddress: string): Promise<number>
```

1. Fetch all trades for the token from the sorted set index
2. Sort by `createdAt`
3. Delete all existing OHLCV keys for the token
4. Replay each trade through `updateOHLCV()`
5. Return count of candles written

### 4.3 Holder balance rebuild helper

**File**: `netlify/functions/_shared/redis-queries.mts`

Add a function to rebuild holder balances for a token:

```typescript
export async function rebuildHolderBalances(tokenAddress: string): Promise<number>
```

1. Delete `op:holders:bal:{tokenAddr}` and `op:holders:{tokenAddr}`
2. Fetch all trades for the token
3. Replay each trade through `updateHolderBalance()`
4. Return count of unique holders

## Phase 5: Tests

### 5.1 Unit test: TXID resolution

**File**: `netlify/__tests__/unit/indexer-core.test.mts`

Test `resolveTxId()`:
- Returns `tx.id` when RPC returns both fields
- Falls back to WTXID when RPC returns null
- Falls back to WTXID when `tx.id` is missing

### 5.2 Unit test: saveTrade overwrite behavior

**File**: `netlify/__tests__/unit/redis-queries.test.mts`

Test that saving a confirmed trade with the same `_id` as a pending trade:
- Sets `isNew = false`
- Preserves original `createdAt`
- Updates `status` to "confirmed"
- Adds `blockNumber` and `blockTimestamp`
- Stores `txHash` (WTXID)

### 5.3 Integration test: full dedup lifecycle

**File**: `netlify/__tests__/integration/trade-dedup.test.mts` (new)

End-to-end test:
1. Submit a pending trade with TXID as `_id`
2. Simulate indexer confirming the same trade with resolved TXID
3. Verify exactly one trade record exists
4. Verify `createdAt` preserved, `status` = "confirmed", `txHash` = WTXID
5. Verify OHLCV volume counted once
6. Verify holder balance counted once

### 5.4 Update existing tests

- Remove orphan dedup test cases (Phase 2.3)
- Update any tests that reference `findAndRemoveOrphanedPendingTrade`
- Update mempool-flow integration test if it references orphan logic

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `shared/types/trade.ts` | Modify — add `txHash?` field, update `_id` comment | 1.4 |
| `netlify/functions/_shared/indexer-core.mts` | Modify — add `resolveTxId`, update event processing, fix bulk confirm, remove orphan calls | 1.1-1.3, 2.2 |
| `netlify/functions/_shared/redis-queries.mts` | Modify — remove `findAndRemoveOrphanedPendingTrade`, add `txHash` to flatten/hydrate, add rebuild helpers | 1.5, 2.1, 4.2, 4.3 |
| `netlify/functions/_shared/event-decoders.mts` | No change (but `hexAddressToBech32m` may move to shared) | — |
| `netlify/functions/trades-submit.mts` | No change to `_id` logic (already uses TXID) | — |
| `frontend/src/hooks/use-trade-simulation.ts` | Modify — normalize `traderAddress` derivation | 3.2 |
| `shared/utils/address.ts` | New — shared `hexAddressToBech32m` | 3.3 |
| `netlify/functions/admin-migrate-dedup.mts` | New — one-time migration endpoint | 4.1 |
| `netlify/__tests__/unit/redis-queries.test.mts` | Modify — remove orphan tests, add overwrite tests | 2.3, 5.2 |
| `netlify/__tests__/integration/trade-dedup.test.mts` | New — dedup lifecycle test | 5.3 |

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `getTransaction()` RPC call adds latency to indexer | Medium | Only called for transactions with trade events (not all block txs). Fallback to WTXID on failure. |
| RPC rate limiting on batch `getTransaction()` calls during migration | Low | Migration uses sequential calls with small delays. Dry-run mode first. |
| Address normalization breaks existing holder tracking | Medium | Migration rebuilds holder balances. Test with dry-run before committing. |
| Migration misses some duplicates | Low | Migration is idempotent — can be re-run. Going forward, new trades are deduped by design. |

## Execution Order

```
Phase 1 (Core Fix)     → Phase 2 (Remove Dead Code) → Phase 3 (Address Norm)
                                                           ↓
                                                      Phase 4 (Migration)
                                                           ↓
                                                      Phase 5 (Tests)
```

Phases 1-2 can be developed and tested together. Phase 3 requires investigation of the address mismatch. Phase 4 depends on all prior phases. Phase 5 runs throughout but final integration tests require all phases complete.

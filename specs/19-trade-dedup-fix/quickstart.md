# Validation Scenarios: Trade Deduplication Fix

## Scenario 1: Happy Path — Buy Trade Lifecycle

```
1. Frontend broadcasts buy → gets TXID "abc123"
2. Frontend POSTs to /api/v1/trades with _id: "abc123", status: "pending"
3. Redis: op:trade:abc123 = { status: "pending", traderAddress: "opt1..." }
4. Indexer processes block → tx.hash = "xyz789" (WTXID)
5. Indexer calls getTransaction("xyz789") → tx.id = "abc123" (TXID)
6. Indexer calls saveTrade({ _id: "abc123", status: "confirmed", txHash: "xyz789" })
7. saveTrade() finds existing createdAt → isNew = false, preserves createdAt
8. Redis: op:trade:abc123 = { status: "confirmed", txHash: "xyz789", createdAt: <original> }
9. Result: ONE trade record, status confirmed, original timestamp preserved
```

**Verify**: `GET /api/v1/tokens/:addr/trades` returns exactly 1 trade for this token.

## Scenario 2: Indexer-First (No Pending Record)

```
1. Indexer processes block before frontend submits
2. tx.hash = "xyz789" → getTransaction() → tx.id = "abc123"
3. saveTrade({ _id: "abc123", status: "confirmed" }) → isNew = true
4. OHLCV written, holder balance updated
5. Frontend later POSTs with _id: "abc123" → saveTrade() → isNew = false
6. No double-counting (isNew guard prevents duplicate OHLCV/holder updates)
```

## Scenario 3: Bulk Confirmation Fallback

```
1. Frontend submits pending trade, _id: "abc123"
2. Indexer event parsing fails (malformed event data)
3. Bulk confirmation resolves TXID for block transactions
4. Finds op:trade:abc123 with status "pending" → confirms it
5. Result: Trade confirmed via safety net
```

## Scenario 4: Migration — Existing Duplicate

```
Before migration:
  op:trade:abc123 = { status: "pending", _id: "abc123" }   ← TXID-keyed
  op:trade:xyz789 = { status: "confirmed", _id: "xyz789" } ← WTXID-keyed (duplicate)

Migration runs:
  1. getTransaction("xyz789") → tx.id = "abc123"
  2. abc123 ≠ xyz789 → this is a WTXID-keyed duplicate
  3. Merge: copy confirmed data to abc123, preserve createdAt, add txHash: "xyz789"
  4. Delete xyz789 record and its index entries
  5. Recalculate OHLCV and holder balances for affected token

After migration:
  op:trade:abc123 = { status: "confirmed", txHash: "xyz789", createdAt: <original> }
```

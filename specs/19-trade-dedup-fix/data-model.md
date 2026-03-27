# Data Model: Trade Deduplication Fix

**Branch**: `19-trade-dedup-fix`
**Date**: 2026-03-27

## Entity Changes

### TradeDocument (modified)

```typescript
export interface TradeDocument {
  _id: string;              // CHANGED: now always TXID (was sometimes WTXID)
  txHash?: string;          // NEW: WTXID for block explorer cross-reference
  tokenAddress: string;
  type: TradeType;
  traderAddress: string;    // CHANGED: must be consistently derived
  btcAmount: string;
  tokenAmount: string;
  pricePerToken: string;
  fees: TradeFees;
  priceImpactBps: number;
  status: TradeStatus;
  blockNumber?: number;
  blockTimestamp?: Date;
  createdAt: Date;
}
```

### Changes Summary

| Field | Before | After | Reason |
|-------|--------|-------|--------|
| `_id` | TXID (frontend) or WTXID (indexer) | Always TXID | Canonical key for dedup |
| `txHash` | N/A | WTXID (optional) | Block explorer cross-reference (FR-003) |
| `traderAddress` | Wallet-reported (frontend) or hex-derived (indexer) | Consistently derived | Address normalization (FR-010) |

## Redis Key Impact

No changes to key patterns. The `_id` value changes, but the key structure remains:

```
op:trade:{_id}                    ← now always TXID
op:idx:trade:token:{tokenAddr}    ← sorted set members are now always TXIDs
op:idx:trade:trader:{traderAddr}  ← sorted set members are now always TXIDs
```

## Removed Functions

| Function | File | Reason |
|----------|------|--------|
| `findAndRemoveOrphanedPendingTrade` | `redis-queries.mts` | Dead code with TXID-based keying (FR-009) |

## State Transitions (unchanged)

```
pending (mempool)  →  confirmed (block)
     _id: TXID           _id: TXID (same key, HSET upsert)
     status: pending      status: confirmed
     blockNumber: null     blockNumber: N
     createdAt: T          createdAt: T (preserved)
     txHash: undefined     txHash: WTXID (added on confirmation)
```

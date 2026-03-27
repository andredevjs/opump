# Feature Specification: Trade Deduplication Fix (TXID vs WTXID)

**Feature Branch**: `19-trade-dedup-fix`
**Created**: 2026-03-27
**Status**: Clarified

## Problem Statement

When a user executes a trade (buy or sell), the system creates two separate trade records for the same on-chain transaction:

1. A **pending** record — created immediately when the frontend submits the trade after broadcast, keyed by the transaction's **TXID** (legacy hash, without witness data).
2. A **confirmed** record — created by the indexer when it parses the block, keyed by the transaction's **WTXID** (full hash, including witness data).

Because the TXID and WTXID are different strings, the system treats them as separate trades. The existing orphan deduplication logic attempts to match them by `traderAddress`, but this also fails because:

- The frontend stores the address as reported by the wallet.
- The indexer derives the address from on-chain event hex data via a conversion function.
- These produce **different bech32m encodings** for the same wallet.

**Result**: Users see duplicate trades in trade history, volume is double-counted, holder balances are inflated, and OHLCV chart data is distorted.

### Evidence

Same transaction on OPScan explorer:
- **Tx ID**: `0xd63889a5...` (TXID — used by pending record)
- **Tx Hash**: `0x29d1cf8a...` (WTXID — used by confirmed record)

Both records share the same `tokenAddress`, same `btcAmount` (37967 sats), and nearly identical `tokenAmount` (differing only by slippage), but have different `_id` and different `traderAddress`.

## User Scenarios & Testing

### User Story 1 — Single Trade Appears Once (Priority: P1)
A user buys or sells a token. The trade appears immediately in the trade list as "pending." When the block confirms, the same trade entry updates to "confirmed" — no duplicate entry is ever shown.

**Why this priority**: Duplicate trades corrupt all derived data (volume, charts, holder counts). This is the core data integrity issue.

**Independent Test**: Execute a buy trade on testnet, wait for block confirmation, query the trades API for that token — only one trade record should exist for that transaction.

**Acceptance Scenarios**:
1. **Given** a user submits a buy trade, **When** the trade is broadcast and the block confirms, **Then** exactly one trade record exists with status "confirmed", the correct block number, and the original `createdAt` timestamp preserved.
2. **Given** a pending trade exists keyed by TXID, **When** the indexer processes the block and finds the same transaction keyed by WTXID, **Then** the pending record is removed and the confirmed record replaces it.
3. **Given** a pending trade has a frontend-derived trader address, **When** the indexer derives a different bech32m address for the same wallet, **Then** the deduplication still correctly identifies and merges the two records.

### User Story 2 — Accurate Volume and Chart Data (Priority: P1)
Token charts and volume statistics reflect each trade exactly once, regardless of whether it was first seen in the mempool or in a confirmed block.

**Why this priority**: Double-counted volume misleads traders about token activity and distorts the bonding curve price display.

**Independent Test**: Submit a trade, wait for confirmation, query OHLCV candles — the volume for that candle should reflect the trade amount once, not twice.

**Acceptance Scenarios**:
1. **Given** a trade is submitted and later confirmed, **When** OHLCV candles are queried, **Then** the trade's volume appears exactly once in the appropriate time bucket.
2. **Given** multiple trades from different users on the same token, **When** some are pending and some confirmed, **Then** total volume equals the sum of unique trades (no double-counting).

### User Story 3 — Correct Holder Balances (Priority: P1)
A user's token balance reflects the actual amount they hold, not an inflated amount from duplicate trade records.

**Why this priority**: Inflated balances affect holder distribution display and graduation threshold calculations.

**Independent Test**: Execute a buy, wait for confirmation, query holders API — the user's balance should equal the on-chain token amount from one trade, not two.

**Acceptance Scenarios**:
1. **Given** a user buys tokens and the trade confirms, **When** the holder balance is queried, **Then** the balance reflects the confirmed on-chain amount (not pending + confirmed combined).

### User Story 4 — Bulk Confirmation Safety Net (Priority: P2)
If the indexer's event parser fails to decode a trade event, the bulk confirmation mechanism still correctly transitions the pending trade to confirmed status.

**Why this priority**: The bulk confirmation path uses `tx.hash` from the block (WTXID), which won't match the pending record's TXID key. This safety net is currently broken for the same reason as the primary path.

**Independent Test**: Simulate a scenario where event parsing is skipped but the transaction appears in a block — the pending trade should still be marked confirmed.

**Acceptance Scenarios**:
1. **Given** a pending trade keyed by TXID exists, **When** the bulk confirmation checks block transactions by WTXID, **Then** the system still identifies and confirms the pending trade.

### Edge Cases
- What happens when the same wallet submits two trades for the same token in rapid succession (before either confirms)? The dedup must not incorrectly merge two genuinely distinct trades.
- What happens if the indexer processes the block before the frontend submits the pending trade? (Confirmed record arrives first, no orphan to find — this should work correctly as-is.)
- What happens if a transaction is replaced (RBF) in the mempool? The old pending record should be cleaned up when the replacement confirms.
- What happens during a blockchain reorganization where a confirmed trade reverts to mempool?

## Requirements

### Functional Requirements
- **FR-001**: The system MUST produce exactly one trade record per on-chain transaction, regardless of whether the transaction was first seen in the mempool or in a confirmed block.
- **FR-002**: The system MUST use the TXID as the canonical trade identifier (`_id`) in both the pending submission path and the indexer confirmation path, so that both records share the same key.
- **FR-003**: The system SHOULD store the WTXID as a secondary field on the trade record for cross-reference with block explorers.
- **FR-004**: Each trade is uniquely identified by its TXID. No fuzzy matching is required — distinct transactions have distinct TXIDs by definition.
- **FR-005**: The system MUST preserve the original `createdAt` timestamp from the pending submission when a trade transitions to confirmed.
- **FR-006**: Volume, OHLCV, and holder balance aggregations MUST reflect each trade exactly once.
- **FR-007**: The bulk confirmation safety net MUST work correctly for TXID/WTXID mismatches, not just for same-hash matches.
- **FR-008**: A one-time migration MUST identify and remove existing duplicate trade records (WTXID-keyed confirmed duplicates of TXID-keyed pending records) and recalculate affected volume, OHLCV, and holder balance data.
- **FR-009**: The orphan dedup logic (`findAndRemoveOrphanedPendingTrade`) MUST be removed. With TXID as the canonical key, `saveTrade()` naturally overwrites the pending record — no separate orphan detection is needed.
- **FR-010**: The `traderAddress` MUST be derived consistently across both the frontend submission path and the indexer confirmation path, so the same wallet always produces the same bech32m address.

### Key Entities
- **Trade**: A buy or sell action on a token's bonding curve. Has a lifecycle: pending → confirmed. Uniquely identified by its on-chain transaction, which has both a TXID and WTXID.
- **TXID**: The legacy transaction identifier (hash of serialization without witness data). Stable across witness modifications. This is what the frontend receives from broadcast.
- **WTXID**: The witness transaction identifier (hash of full serialization including witness). This is what the indexer sees in block data (`tx.hash`).

## Success Criteria

### Measurable Outcomes
- **SC-001**: For any confirmed transaction visible on the block explorer, querying the trades API returns exactly one trade record (not zero, not two).
- **SC-002**: Total trade volume reported by the API for a token matches the sum of unique on-chain trade events (verified against block explorer).
- **SC-003**: Holder balances reported by the API match on-chain contract state.
- **SC-004**: No regression in mempool-first responsiveness — trades still appear in the UI immediately upon broadcast, before block confirmation.
- **SC-005**: The existing test suite continues to pass, with new tests covering the TXID≠WTXID dedup scenario.

## Clarifications

### Session 2026-03-27
- Q: What identifier does the frontend receive from broadcast? → A: **TXID only.** The WTXID (`tx.hash`) is generated only after confirmation. However, both are available via `provider.getTransaction(txid)` which returns `{ id: string /* txid */, hash: string /* wtxid */ }`. The RPC accepts the TXID and returns the full object with both identifiers.
- **Implication**: The canonical trade key should be the **TXID** (`tx.id`) everywhere. The indexer currently uses `tx.hash` (WTXID) — switching it to `tx.id` (TXID) will make pending and confirmed records share the same `_id`, eliminating the dedup problem entirely. The WTXID can optionally be stored as a secondary field for reference.
- Q: Should the fix include a cleanup of existing historical duplicates? → A: **Yes.** Include a one-time migration script to identify and remove duplicate trade records already in Redis, and recalculate affected volume/OHLCV/holder data.
- Q: Should the orphan dedup logic (`findAndRemoveOrphanedPendingTrade`) be removed? → A: **Yes, remove it.** Once the indexer keys by TXID, `saveTrade()` naturally overwrites the pending record with the same `_id`. The orphan logic becomes dead code.
- Q: Should the `traderAddress` mismatch between frontend and indexer be normalized? → A: **Yes, normalize.** Both the frontend submission and the indexer should derive the same bech32m address for the same wallet, so the address is consistent across the pending→confirmed transition.
- Q: Does the OPNet block RPC include both `id` (TXID) and `hash` (WTXID) on each transaction? → A: **No, only `hash`.** The indexer will need to call `getTransaction(hash)` to resolve the TXID for each trade event. Only needed for transactions that contain trade events (not every transaction in the block).

## Assumptions
- The OPNet RPC's `TransactionBase` interface provides both `id` (TXID) and `hash` (WTXID) on every transaction object.
- The frontend broadcast returns only the TXID. The WTXID is not available until the transaction is retrievable via RPC.
- Using TXID as the canonical `_id` eliminates the need for fuzzy orphan matching — `saveTrade()` will see `isNew = false` when the confirmed trade overwrites the pending one with the same key.
- Block transaction objects only provide `hash` (WTXID). The indexer must call `getTransaction(hash)` to resolve the TXID for transactions containing trade events.

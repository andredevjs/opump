# API Contract: Indexer Changes

## processBuyEvent / processSellEvent

**Before**: `txHash` parameter is `tx.hash` (WTXID) from block data.
**After**: `txHash` parameter is `tx.id` (TXID) resolved via `provider.getTransaction(tx.hash)`. A new `wtxid` parameter carries the original `tx.hash` for storage.

## Bulk Confirmation Safety Net

**Before**: Looks up `TRADE_KEY(tx.hash)` — misses pending trades keyed by TXID.
**After**: For each block transaction, resolves TXID via `provider.getTransaction(tx.hash)`, then looks up `TRADE_KEY(txid)`.

## Trade Submission (trades-submit.mts)

**Before**: `_id: body.txHash` (already TXID from broadcast). No changes needed.
**After**: Same. Optionally, `traderAddress` derivation may change per address normalization.

## TradeDocument API Response

**Before**: `_id` could be TXID or WTXID depending on path.
**After**: `_id` is always TXID. New optional `txHash` field contains WTXID when available.

No breaking changes to the external API — `_id` was already documented as "tx hash" and TXID is the conventional transaction identifier.

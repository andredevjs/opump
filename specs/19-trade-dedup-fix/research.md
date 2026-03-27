# Phase 0 — Research: Trade Deduplication Fix

**Branch**: `19-trade-dedup-fix`
**Date**: 2026-03-27

## R1: How does the OPNet RPC expose TXID vs WTXID?

**Finding**: The `TransactionBase` interface from the `opnet` package provides:
- `id: string` — the TXID (legacy hash, without witness)
- `hash: string` — the WTXID (full hash, with witness)

Both `getTransaction(txid)` and `getPendingTransaction(txid)` accept the TXID and return the full object.

**However**, when fetching a block via `provider.getBlock(blockNum, true)`, the transaction objects within `block.transactions` only expose `hash` (WTXID), not `id` (TXID).

**Decision**: The indexer must call `provider.getTransaction(tx.hash)` for each transaction containing a trade event to resolve its TXID. This adds one RPC call per trade event per block, but trade events are a small subset of block transactions.

**Alternative considered**: Store WTXID as the canonical key instead. Rejected because the frontend only receives the TXID from broadcast — changing the frontend to also fetch the WTXID would add latency to the user-facing broadcast flow.

## R2: Address derivation mismatch

**Finding**: Two different address derivation paths exist:

1. **Frontend**: Uses `walletAddress` from `useWalletStore().address`, which is synced from the OPWallet via `syncWallet()`. This is the wallet's self-reported bech32m address.

2. **Indexer**: Extracts the buyer/seller hex address from event data (`data.buyer`), then converts via `hexAddressToBech32m()` which calls `toBech32(bytes, 16, network.bech32, network.bech32Opnet)`.

The event data's hex address is the **hashed ML-DSA public key** (32 bytes). The wallet's self-reported address may be derived from different key material or use different encoding parameters.

**Decision**: Investigate whether the wallet-reported address matches `hexAddressToBech32m(hashedMLDSAKey)`. The wallet store has `hashedMLDSAKey` available. If they match, the frontend should use the same `hexAddressToBech32m()` function. If not, the indexer's on-chain derivation is authoritative and the frontend should be updated to match.

## R3: Migration script approach

**Finding**: All trade data is in Upstash Redis. Duplicate trades can be identified by:
1. Scanning all `op:trade:*` keys
2. For each trade, checking if another trade exists with matching `tokenAddress + type + btcAmount + traderAddress` (approximately) and `status = pending` while the other is `confirmed`
3. The WTXID-keyed duplicate (confirmed) should be re-keyed to the TXID, and the TXID-keyed pending record deleted

**Better approach**: Since we know the OPNet RPC can resolve TXID from WTXID, the migration can:
1. Scan all confirmed trades
2. For each, call `getTransaction(hash)` to get the TXID
3. If the `_id` differs from the TXID, re-key the trade to the TXID
4. Delete any orphaned pending record with the old TXID key
5. Recalculate affected OHLCV and holder data

**Decision**: Use the RPC-based approach for precision. Run as a one-time Netlify function (`/api/v1/admin/migrate-dedup`).

## R4: OHLCV recalculation scope

**Finding**: OHLCV candles are stored per token per time bucket. Duplicate trades may have written volume twice. After removing duplicates, we need to recalculate candles for affected tokens.

**Decision**: The migration script will track which tokens had duplicates removed, then wipe and rebuild OHLCV for those tokens from the remaining trade records. This is simpler and more reliable than trying to subtract the duplicate volume.

## R5: Holder balance recalculation

**Finding**: `updateHolderBalance()` is called only on first save (`isNew = true` in `saveTrade()`). If a duplicate trade was saved as "new" (because the WTXID was different), the holder balance was incremented twice.

**Decision**: The migration script will recalculate holder balances from scratch for affected tokens by replaying all remaining trade records.

## R6: Address derivation mismatch — investigation results

**Finding**: The frontend uses `walletAddress` from `useWalletConnect()` (the wallet's self-reported address). This comes from `@btc-vision/walletconnect` which returns whatever the wallet reports as its address.

The indexer uses `hexAddressToBech32m(data.buyer, network)` where `data.buyer` is the hashed ML-DSA public key (32 bytes hex) extracted from the on-chain Buy event. This function calls `toBech32(bytes, 16, network.bech32, network.bech32Opnet)`.

The wallet also provides `hashedMLDSAKey` via `useWalletConnect()`, which is the same hex value that appears in on-chain events. The wallet-reported `address` is likely derived differently (possibly a Bitcoin taproot address vs the OPNet-specific bech32 encoding).

**Evidence**: The two observed addresses for the same transaction are completely different strings:
- Wallet-reported: `opt1pp20u32tl9ug9aaa6wql3jc2kxqnju20nvydstqhel6e7zj5ec3yq76sq5r`
- Indexer-derived: `opt1shuhs5kqrf7z0c8gerg09xnnr0362kllrh8q3lgwng0px2lmpla9sya0a6h`

**Decision**: The frontend must derive `traderAddress` using `hexAddressToBech32m(hashedMLDSAKey, network)` — the same function the indexer uses. This ensures both paths produce identical addresses. Cross-directory imports don't work with Netlify's esbuild bundler, so the function will be duplicated in the frontend (following the existing mirroring pattern in `netlify/functions/_shared/constants.mts`).

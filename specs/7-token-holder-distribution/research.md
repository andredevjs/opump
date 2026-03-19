# Research: Token Holder Distribution

**Branch**: `7-token-holder-distribution`
**Date**: 2026-03-19

## Current State Analysis

### Holder Tracking (Current)
- **Redis key**: `op:holders:{tokenAddr}` — a Redis SET storing unique holder addresses
- **Tracked via**: `saveTrade()` in `redis-queries.mts` — `SADD` on buy events only
- **Read via**: `getHolderCount()` — `SCARD` on the set
- **Limitation**: Only tracks presence, not per-holder balances. No sell-side removal.

### Trade Flow (Mempool-First)
1. **Frontend broadcast** → `POST /api/v1/trades` (`trades-submit.mts`)
   - Calls `saveTrade()` — adds buyer to holder set
   - Calls `updateToken()` — updates holderCount, volume, price, reserves
2. **Indexer confirmation** → `indexer-core.mts` (1-min scheduled)
   - Calls `saveTrade()` again with confirmed data
   - `updateAffectedTokenStats()` re-reads `getHolderCount()`

### Token Detail API
- `GET /api/v1/tokens/:address` → returns full `TokenDocument` + `priceChange24hBps`
- Frontend fetches on page load and polls via `usePriceFeed` hook

### Token Info Tab (Current Fields)
- Description, Contract address, Creator address, Created time, Creator Allocation %, Buy/Sell Tax

## Technical Decisions

### D1: Balance Storage → Redis Sorted Set
**Decision**: Use `ZADD` sorted set with score = balance (as number) for per-holder balance tracking.
**Rationale**: `ZREVRANGE` with WITHSCORES gives us top N holders in O(log N + N), perfect for "top 10" queries. Redis sorted sets handle concurrent updates cleanly.
**Alternative considered**: Hash map per token — rejected because no efficient "sort by value" operation.

### D2: Circulating Supply → Derived from Bonding Curve + Creator Allocation
**Decision**: `circulatingSupply = INITIAL_VIRTUAL_TOKEN_SUPPLY - BigInt(token.virtualTokenSupply) + creatorAllocationTokens`
**Rationale**: Already computable from existing token data. No new storage needed. The formula accounts for:
- Tokens bought from the bonding curve (reduces virtualTokenSupply)
- Creator allocation (minted separately, not reflected in virtualTokenSupply)
**Alternative considered**: Running counter in Redis — rejected as redundant with derivable data.
**Fallback**: If the derived value diverges from sum-of-balances, we can add a periodic reconciliation job.

### D3: API Design → New Endpoint
**Decision**: New `GET /api/v1/tokens/:address/holders` endpoint, separate from token detail.
**Rationale**: Keeps token detail response lean. Holder data is only needed on the Token Info tab, not in list views or other consumers.
**Alternative considered**: Embed in token detail response — rejected to avoid payload bloat.

### D4: Sell-Side Balance Updates → ZINCRBY + Conditional Remove
**Decision**: On sell, `ZINCRBY` by negative tokenAmount, then check score. If ≤ 0, `ZREM` from balance set + `SREM` from holder set.
**Rationale**: Handles partial and full sells correctly. Two Redis commands (not atomic) is acceptable — worst case, a zero-balance holder briefly appears in the sorted set before cleanup.

### D5: Creator Allocation → Seed on Token Creation
**Decision**: When a token is created with `creatorAllocationBps > 0`, seed the creator's balance in the sorted set.
**Rationale**: The creator holds tokens from genesis. If we don't seed, the holder list will be missing the creator until they make a trade.
**Calculation**: `creatorAllocationTokens = (INITIAL_VIRTUAL_TOKEN_SUPPLY * creatorAllocationBps) / 10000`

# Implementation Plan: Token Holder Distribution

**Branch**: `7-token-holder-distribution` | **Date**: 2026-03-19 | **Spec**: specs/7-token-holder-distribution/spec.md

## Summary

Add per-holder balance tracking via a Redis sorted set, expose a new API endpoint for top holders, and display the data in the Token Info tab. The main technical challenge is upgrading from presence-only holder tracking (Redis SET) to balance-aware tracking (Redis SORTED SET) while maintaining mempool-first consistency.

## Technical Context

**Language/Version**: TypeScript (Node 20+)
**Primary Dependencies**: React 18, Vite, TailwindCSS, Zustand (frontend); Netlify Functions, Upstash Redis (backend)
**Storage**: Upstash Redis — sorted set for holder balances, existing hashes for token data
**Testing**: Manual validation (no test framework in place)
**Target Platform**: Web (SPA + serverless API)
**Project Type**: Web application (frontend + netlify functions)
**Performance Goals**: Top holders query < 100ms, no additional polling overhead
**Constraints**: Mempool-first — holder data must update on trade submission, not block confirmation

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| 1. SafeMath for u256 | N/A | No contract changes in this feature |
| 2. Frontend never holds signing keys | PASS | No signing involved |
| 3. API responses follow shared type definitions | PASS | New types added to `shared/types/api.ts` |
| 4. Mempool-first updates | PASS | Balance tracking happens in `saveTrade()` and `trades-submit.mts` |

No violations.

## Architecture Overview

```
                     ┌─────────────────────┐
                     │   Token Info Tab     │
                     │  (TopHolders comp)   │
                     └──────────┬──────────┘
                                │ GET /holders
                     ┌──────────▼──────────┐
                     │  holders-list.mts    │
                     │  (new endpoint)      │
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │  redis-queries.mts   │
                     │  getTopHolders()     │
                     │  updateHolderBal()   │
                     └──────────┬──────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                   │
    ┌─────────▼────────┐ ┌─────▼──────┐  ┌────────▼────────┐
    │ op:holders:bal:*  │ │ op:holders:│  │ TokenDocument    │
    │ (Sorted Set)      │ │ * (Set)    │  │ (Hash)           │
    │ score=balance     │ │ existing   │  │ virtualTokenSup  │
    └──────────────────┘ └────────────┘  └─────────────────┘
```

## Implementation Phases

### Phase 1: Backend — Balance Tracking (redis-queries.mts)

**Goal**: Track per-holder balances in a Redis sorted set, updated on every trade.

**Files modified**:
- `netlify/functions/_shared/redis-queries.mts`

**Changes**:
1. Add new key helper: `TOKEN_HOLDER_BALANCES = (tokenAddr) => op:holders:bal:${tokenAddr}`
2. Add `updateHolderBalance(tokenAddress, traderAddress, tokenAmount, type)`:
   - Buy: `ZINCRBY` by +tokenAmount
   - Sell: `ZINCRBY` by -tokenAmount, then check score, `ZREM` + `SREM` if ≤ 0
3. Add `getTopHolders(tokenAddress, limit=10)`: `ZREVRANGE` with `WITHSCORES`
4. Update `saveTrade()`: call `updateHolderBalance()` for both buy AND sell trades
   - Currently only `SADD` on buy — extend to handle sells and balance tracking
5. Export `TOKEN_HOLDER_BALANCES` key helper for use in token creation flow

### Phase 2: Backend — Seed Creator Allocation (tokens-create)

**Goal**: When a token is created with creator allocation, seed the creator's balance.

**Files modified**:
- `netlify/functions/tokens-create.mts` (or wherever token creation saves to Redis)

**Changes**:
1. After saving the token document, if `creatorAllocationBps > 0`:
   - Calculate: `creatorTokens = (INITIAL_VIRTUAL_TOKEN_SUPPLY * creatorAllocationBps) / 10000n`
   - `ZADD` to balance sorted set with creator address + creatorTokens
   - `SADD` to holder set (already done if existing)
2. This ensures the creator appears in the holder list from genesis

### Phase 3: Backend — New API Endpoint

**Goal**: Serve top holder data with percentages.

**New file**:
- `netlify/functions/holders-list.mts`

**Changes**:
1. Create `GET /api/v1/tokens/:address/holders` endpoint
2. Fetch token document (for `virtualTokenSupply`, `config.creatorAllocationBps`)
3. Call `getTopHolders(address, limit)` from redis-queries
4. Compute circulating supply: `INITIAL_VIRTUAL_TOKEN_SUPPLY - BigInt(token.virtualTokenSupply) + creatorAllocationTokens`
5. Calculate percentage for each holder: `(balance / circulatingSupply) * 100`
6. Return `HolderListResponse` (see contracts/holders-endpoint.md)

### Phase 4: Shared Types

**Goal**: Add holder-related types to shared type definitions.

**Files modified**:
- `shared/types/api.ts`

**Changes**:
1. Add `HolderEntry` interface: `{ address: string; balance: string; percent: number }`
2. Add `HolderListResponse` interface: `{ holders: HolderEntry[]; holderCount: number; circulatingSupply: string }`

### Phase 5: Frontend — API Client + Types

**Goal**: Add API function and frontend types for holder data.

**Files modified**:
- `frontend/src/services/api.ts`
- `frontend/src/types/token.ts` (or new holder types file)

**Changes**:
1. Add `getTokenHolders(address: string, limit?: number)` API function
2. Add `HolderEntry` and `HolderListResponse` types to frontend types

### Phase 6: Frontend — TopHolders Component

**Goal**: Display the top holders list and holder count in the Token Info tab.

**New file**:
- `frontend/src/components/token/TopHolders.tsx`

**Changes**:
1. Create `TopHolders` component:
   - Props: `tokenAddress: string`
   - Fetches holder data from API on mount and on token address change
   - Renders:
     - "Holders" count as a labeled field
     - "Top Holders" section header
     - Ordered list of holders: `{percent}% — {truncatedAddress}` with copy-to-clipboard
     - Empty state: "No holders yet" message
     - Loading state: skeleton placeholders
2. Each address uses existing `AddressDisplay` component for truncation + copy
3. Percentage formatted to 2 decimal places, with "< 0.1%" for near-zero values

### Phase 7: Frontend — Token Info Tab Integration

**Goal**: Wire TopHolders into the Token Info tab on TokenPage.

**Files modified**:
- `frontend/src/pages/TokenPage.tsx`

**Changes**:
1. Import `TopHolders` component
2. Add it to the Token Info `TabsContent` after the existing grid of fields
3. The component self-manages its data fetching — no store changes needed
4. Data refreshes when the token detail polling cycle triggers a re-render

## Dependency Graph

```
Phase 1 (balance tracking) ──┬──→ Phase 3 (API endpoint) ──→ Phase 5 (API client)
                              │                                       │
Phase 2 (creator seed)  ──┘                                          │
                                                                      ▼
Phase 4 (shared types) ──────────────────────────────────→ Phase 6 (component)
                                                                      │
                                                                      ▼
                                                            Phase 7 (integration)
```

Phases 1+2 can be done in parallel. Phase 4 can be done any time before Phase 5+6.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Redis sorted set score precision loss for large balances | Medium | Medium | Token amounts as BigInt strings can exceed Number.MAX_SAFE_INTEGER. Use string scores or split into high/low. See note below. |
| Balance drift from missed trades | Low | Low | Indexer re-processes confirmed trades; periodic reconciliation possible later |
| Additional Redis calls per trade | Low | Low | ZINCRBY is O(log N), negligible overhead |

### Score Precision Note
Redis sorted set scores are IEEE 754 doubles (max safe integer ~9 * 10^15). Token amounts with 8 decimals can be up to 10^17 (100B tokens * 10^8). For amounts exceeding `Number.MAX_SAFE_INTEGER`, we lose precision in the sorting. **Mitigation**: For the top holders query, slight score imprecision for very large holders is acceptable — they'll still sort to the top. The exact balance can be stored as a hash field alongside the sorted set if needed for display. Start simple; add hash backup if precision becomes an issue.

## Project Structure (affected files)

```
netlify/
├── functions/
│   ├── _shared/
│   │   ├── redis-queries.mts    ← MODIFY (add balance tracking + query)
│   │   └── constants.mts        ← NO CHANGE
│   ├── trades-submit.mts        ← NO CHANGE (saveTrade handles it)
│   ├── tokens-create.mts        ← MODIFY (seed creator balance) [if exists]
│   ├── holders-list.mts         ← NEW (API endpoint)
│   └── indexer-core.mts         ← NO CHANGE (saveTrade handles it)
shared/
└── types/
    └── api.ts                   ← MODIFY (add holder types)
frontend/
└── src/
    ├── services/
    │   └── api.ts               ← MODIFY (add getTokenHolders)
    ├── types/
    │   └── token.ts             ← NO CHANGE (or minor additions)
    ├── components/
    │   └── token/
    │       └── TopHolders.tsx    ← NEW (holder list component)
    └── pages/
        └── TokenPage.tsx        ← MODIFY (add TopHolders to Token Info tab)
```

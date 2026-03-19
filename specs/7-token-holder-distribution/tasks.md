# Tasks: Token Holder Distribution

**Branch**: `7-token-holder-distribution`
**Generated**: 2026-03-19
**Total**: 10 tasks across 5 phases

---

## Phase 1: Shared Types
> No dependencies. Can run in parallel with Phase 2.

- [x] T001 [P] Add `HolderEntry` and `HolderListResponse` interfaces to `shared/types/api.ts`. `HolderEntry`: `{ address: string; balance: string; percent: number }`. `HolderListResponse`: `{ holders: HolderEntry[]; holderCount: number; circulatingSupply: string }`.

## Phase 2: Backend — Balance Tracking
> No dependencies. Can run in parallel with Phase 1.

- [x] T002 Add `TOKEN_HOLDER_BALANCES` key helper (`op:holders:bal:${tokenAddr}`) and `updateHolderBalance(tokenAddress, traderAddress, tokenAmount, type)` function to `netlify/functions/_shared/redis-queries.mts`. On buy: `ZINCRBY` by +tokenAmount, `SADD` to holder set. On sell: `ZINCRBY` by -tokenAmount, check score, if ≤ 0 then `ZREM` from balance set + `SREM` from holder set. Export both the key helper and the function.

- [x] T003 Add `getTopHolders(tokenAddress, limit=10)` function to `netlify/functions/_shared/redis-queries.mts`. Use `ZREVRANGE` with `WITHSCORES` on `TOKEN_HOLDER_BALANCES` key. Return array of `{ address: string; balance: string }` (balance as BigInt string). Export the function.

- [x] T004 Update `saveTrade()` in `netlify/functions/_shared/redis-queries.mts` to call `updateHolderBalance()` for BOTH buy and sell trades. Replace the existing `SADD`-only logic for buys. The `updateHolderBalance` call should use `trade.tokenAddress`, `trade.traderAddress`, `trade.tokenAmount`, and `trade.type`.

## Phase 3: Backend — Creator Allocation & API Endpoint
> Depends on Phase 2 (T002-T004 must be complete).

- [x] T005 Seed creator allocation balance in `netlify/functions/_shared/create-token.mts`. After `saveToken(tokenDoc)` (line 174), if `tokenDoc.config.creatorAllocationBps > 0`: calculate `creatorTokens = (INITIAL_VIRTUAL_TOKEN_SUPPLY * BigInt(tokenDoc.config.creatorAllocationBps)) / 10000n`, then call Redis `ZADD` on `TOKEN_HOLDER_BALANCES(tokenDoc.contractAddress)` with score=Number(creatorTokens) and member=tokenDoc.creatorAddress, and `SADD` on `TOKEN_HOLDERS_SET(tokenDoc.contractAddress)` with tokenDoc.creatorAddress. Update `holderCount` to 1 on the token doc. Import `getRedis` and the key helpers needed.

- [x] T006 Create new Netlify Function `netlify/functions/holders-list.mts` implementing `GET /api/v1/tokens/:address/holders`. Steps: (1) Parse `limit` query param (default 10, max 50). (2) Call `getToken(address)` — return 404 if not found. (3) Call `getTopHolders(address, limit)`. (4) Call `getHolderCount(address)`. (5) Compute `circulatingSupply = INITIAL_VIRTUAL_TOKEN_SUPPLY - BigInt(token.virtualTokenSupply) + (INITIAL_VIRTUAL_TOKEN_SUPPLY * BigInt(token.config.creatorAllocationBps)) / 10000n`. (6) For each holder, compute `percent = Number(BigInt(holder.balance) * 10000n / circulatingSupply) / 100` (2 decimal places). Handle `circulatingSupply === 0n` edge case (return empty holders array). (7) Return `HolderListResponse`. Export config with `path: "/api/v1/tokens/:address/holders"` and `method: ["GET", "OPTIONS"]`.

## Phase 4: Frontend — API Client & Component
> Depends on Phase 1 (T001) and Phase 3 (T006).

- [x] T007 [P] Add `getTokenHolders(address: string, limit?: number)` function to `frontend/src/services/api.ts`. Import `HolderListResponse` from `@shared/types/api`. Call `GET /v1/tokens/${address}/holders?limit=${limit}`. Return `Promise<HolderListResponse>`.

- [x] T008 [P] Create `frontend/src/components/token/TopHolders.tsx`. Component accepts `tokenAddress: string` prop. On mount (and when tokenAddress changes), fetch holder data via `getTokenHolders(tokenAddress)`. Render: (1) "Holders" label + `holderCount` value as a labeled field matching existing Token Info grid style. (2) "Top Holders" subheading. (3) Ordered list where each row shows `{percent}%` (formatted to 2 decimals, or "< 0.1%" if percent < 0.1 and > 0) followed by the address using `AddressDisplay` component (with `showCopy`). (4) Loading state: 3 `Skeleton` lines. (5) Empty state: "No holders yet" text in `text-text-muted`. (6) Error state: silent (don't break the page). Use `useState` + `useEffect` for data fetching (no store needed). Import `AddressDisplay` from `@/components/shared/AddressDisplay`, `Skeleton` from `@/components/ui/Skeleton`.

## Phase 5: Frontend — Integration
> Depends on Phase 4 (T007, T008).

- [x] T009 [US1] [US2] Wire `TopHolders` component into the Token Info tab in `frontend/src/pages/TokenPage.tsx`. Import `TopHolders` from `@/components/token/TopHolders`. Add `<TopHolders tokenAddress={token.address} />` inside the `TabsContent value="info"` block, after the existing `grid grid-cols-2 gap-3` div (after line 185, before the closing `</div>` of `space-y-3 text-sm`). Add a divider (`<div className="border-t border-border pt-3" />`) before the component to visually separate it from the token metadata above.

- [x] T010 [US3] Add polling refresh to `TopHolders` component in `frontend/src/components/token/TopHolders.tsx`. Re-fetch holder data on the same interval as the token detail polling (the component will naturally re-fetch when `tokenAddress` changes or the parent re-renders from polling). Add a dependency on an `updatedAt` or `key` prop that changes when the parent token data refreshes, OR use a simple `setInterval` (e.g., 30 seconds) inside the component to re-fetch holder data independently. This ensures holder data stays fresh per the mempool-first architecture.

---

## Dependency Graph

```
T001 (shared types) ─────────────────────────────┐
                                                   ├──→ T007 (API client) ──┐
T002 (balance tracking) ──→ T004 (saveTrade) ──┐  │                         │
T003 (getTopHolders)    ──────────────────────┤  │    T008 (component)  ──┤
                                                ├──→ T005 (creator seed)    ├──→ T009 (integration)
                                                └──→ T006 (API endpoint) ──┘     │
                                                                                  └──→ T010 (polling)
```

## Parallel Opportunities
- **T001** and **T002/T003** can run in parallel (different files, no deps)
- **T007** and **T008** can run in parallel (different files, both depend on T001+T006 but not on each other)

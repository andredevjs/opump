# Implementation Plan: Real-Time State Propagation

**Branch**: `2-realtime-state-propagation` | **Date**: 2026-03-16 | **Spec**: `specs/2-realtime-state-propagation/spec.md`

## Summary

Fix the broken real-time update pipeline so all trading data (volume, holders, trades, prices, charts) updates instantly for all users via WebSocket, instead of relying on stale polling or page-specific connections. Backend adds debounced stat broadcasts, fixes simulation reserves, and repairs data bugs. Frontend moves WS to app root, adds global event feed, and wires all pages to react to WS events.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20+
**Primary Dependencies**:
- Backend: HyperExpress (NOT Express), MongoDB (native driver), OPNet SDK
- Frontend: React 18, Vite, Zustand, TailwindCSS
**Storage**: MongoDB (no ORM, native driver)
**Testing**: Manual testing against OPNet testnet (no automated test framework in place)
**Target Platform**: Web (SPA) + Node.js backend
**Project Type**: Web application (backend/ + frontend/ + shared/)
**Performance Goals**: <2s propagation for trade data, <200ms simulation with 50 pending trades, <5s reconnection recovery
**Constraints**: Mempool-first (CLAUDE.md constitution). HyperExpress only. No Express.js.

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| 1. Never use Express.js — HyperExpress only | PASS | All backend routes use HyperExpress |
| 2. All contract math uses SafeMath | N/A | No contract changes in this feature |
| 3. Frontend never holds signing keys | PASS | No signing changes |
| 4. All API responses follow shared type definitions | PASS | New fields added to shared/types/token.ts |
| 5. Mempool-first: all UI updates on mempool detection | PASS | This feature specifically fixes mempool-first gaps |

No violations. No justified exceptions needed.

---

## Phase 0: P0 — Critical Backend Fixes

These fixes address platform-visibly-broken behavior. Each is independently deployable.

### 0a. Fix parseInt precision loss in MempoolService

**Files**: `backend/src/services/MempoolService.ts`
**FR**: FR-008

Replace `parseInt(btcAmount, 10) || 0` with `Number(btcAmount) || 0` at:
- Line ~343 (registerPendingTrade)
- Line ~244 (dropTrade)

`Number()` is safe for sats values (total BTC supply ~2.1×10^15 < Number.MAX_SAFE_INTEGER ~9×10^15).

### 0b. Fix simulation to use optimistic reserves

**Files**: `backend/src/index.ts`, `backend/src/routes/simulate.ts`
**FR**: FR-005

1. In `index.ts` line ~82: Change `registerSimulateRoutes(app)` → `registerSimulateRoutes(app, optimisticService)`
2. In `simulate.ts`: Add `optimisticService` parameter. In both buy/sell handlers, after fetching token doc:
   - Call `optimisticService.getOptimisticPrice(tokenAddress)`
   - If `isOptimistic`, use returned reserves (includes kConstant)
   - If not, use DB reserves (current behavior)
   - Tax BPS still read from `token.config`

### 0c. Fix OptimisticStateService: pending cap + error handling

**Files**: `backend/src/services/OptimisticStateService.ts`
**FR**: FR-006, FR-007

1. **Pending cap** in `addPendingTrade()`: If `pendingAdjustments.length >= 50`, call `.shift()` to drop oldest.
2. **Error handling** in `getOptimisticPrice()`: On simulation catch, `break` out of loop instead of `continue`. Returns last-known-good reserves.

### 0d. Include reserves in confirmed price_update broadcasts

**Files**: `backend/src/services/IndexerService.ts`
**FR**: FR-004

In `processBuyEvent()` and `processSellEvent()`, after `syncTokenReserves()` completes:
- Read updated token doc from DB
- Include `virtualBtcReserve`, `virtualTokenSupply`, `realBtcReserve` in the `price_update` broadcast payload

Current broadcast (line ~350) only sends `{ currentPriceSats, isOptimistic: false }`. Add reserve fields.

### 0e. Create BroadcastDebouncer service

**Files**: `backend/src/services/BroadcastDebouncer.ts` (NEW)
**FR**: FR-003, NFR-001, NFR-002, NFR-003

New class with:
- `scheduleTokenStats(tokenAddress, stats)`: Per-token trailing-edge debounce, 2s. Replaces pending data on each call.
- `schedulePlatformStats(stats)`: Single trailing-edge timer, 3s. Replaces pending data on each call.
- `tokenActivity(tokenAddress, data)`: Immediate broadcast (no debounce). Lightweight signal.
- `evictInactive()`: Runs every 60s. Clears timers for tokens with no activity for 10min.
- `flush()`: Sends all pending broadcasts immediately. Called on shutdown.
- `stop()`: Clears all timers including eviction interval.

Constructor receives `wsService` reference. Broadcasts to:
- `token:stats:{tokenAddress}` / `token_stats_update`
- `platform` / `platform_stats_update`
- `platform` / `token_activity`

### 0f. Add stats broadcasts from MempoolService

**Files**: `backend/src/services/MempoolService.ts`
**FR**: FR-003, FR-011

In `registerPendingTrade()`, after existing $inc operations:
1. Read current token doc (already have `btcAmount` and computed `pricePerToken`)
2. Compute approximate stats in-memory:
   - `volume24h`: token doc's current `volume24h` + `Number(btcAmount)` (approximate, corrected on block)
   - `volumeTotal`: token doc's current `volumeTotal` + `Number(btcAmount)`
   - `tradeCount24h`: use cached count from last block + in-memory increment
   - `holderCount`: cached from last block (no expensive aggregation)
   - `marketCapSats`: from optimistic reserves
3. `debouncer.scheduleTokenStats(tokenAddress, stats)` — debounced 2s
4. `debouncer.tokenActivity(tokenAddress, { tokenAddress, lastPrice, volume24h, btcAmount })` — immediate

In `dropTrade()`:
- Schedule updated stats after $inc reversal

### 0g. Add stats broadcasts from IndexerService

**Files**: `backend/src/services/IndexerService.ts`
**FR**: FR-003

In `updateTokenStats()`, after computing canonical stats and saving to DB:
- `debouncer.scheduleTokenStats(tokenAddress, canonicalStats)` — these overwrite any mempool approximations

### 0h. Wire BroadcastDebouncer into service graph

**Files**: `backend/src/index.ts`
**FR**: FR-003, FR-009

1. Instantiate `BroadcastDebouncer` after `wsService`
2. Pass to `MempoolService` and `IndexerService` constructors
3. Call `debouncer.flush()` and `debouncer.stop()` in graceful shutdown

---

## Phase 1: P1 — Frontend Global WS + Event Feeds

### 1a. Move WebSocket connection to app root

**Files**: `frontend/src/App.tsx`, `frontend/src/hooks/use-price-feed.ts`
**FR**: FR-001

1. In `App.tsx`: Add `useEffect(() => { wsClient.connect(); }, [])` at component root level
2. In `use-price-feed.ts`: Remove `wsClient.connect()` call (line ~185). WS is now always connected.

### 1b. Add WebSocket reconnection detection

**Files**: `frontend/src/services/websocket.ts`
**FR**: FR-002

1. Add `private _wasConnectedBefore = false` flag
2. In `onopen` handler: After re-subscribing channels, if `_wasConnectedBefore`, notify connection listeners with `{ connected: true, isReconnect: true }`
3. Set `_wasConnectedBefore = true` after first successful connect
4. Expose `onReconnect(callback)` — registers callback that fires only on reconnection (not initial connect)

### 1c. Add reconnection recovery to usePriceFeed

**Files**: `frontend/src/hooks/use-price-feed.ts`
**FR**: FR-002

Register `wsClient.onReconnect()` callback:
- If currently viewing a token, call `refreshFromServer()` to refetch price + OHLCV + trades

### 1d. Create useGlobalFeed hook

**Files**: `frontend/src/hooks/use-global-feed.ts` (NEW)
**FR**: FR-009, FR-010, FR-011, FR-016, FR-022

New hook, mounted once in App.tsx:
- Subscribe to `platform` channel
- Handle events:
  - `new_token`: Call `mapApiTokenToToken(data)`, add to token store
  - `token_activity`: If tokenAddress matches any token in store, patch `currentPriceSats` and `volume24hSats`. Schedule throttled refetch (max 1 per 2.5s).
  - `platform_stats_update`: Update platform stats directly in a new platform-stats store (or extend token-store)
  - `token_graduated` / `token_migrating` / `token_migrated`: Update token status in store
- On WS reconnect: refetch platform stats + trigger token list refetch

### 1e. Add token:stats subscription to usePriceFeed

**Files**: `frontend/src/hooks/use-price-feed.ts`
**FR**: FR-014

Subscribe to `token:stats:{address}` channel:
- On `token_stats_update`: Call `updateTokenStats(address, stats)` with all stat fields from payload

### 1f. Broadcast platform_stats_update from backend

**Files**: `backend/src/services/MempoolService.ts`, `backend/src/services/IndexerService.ts`, `backend/src/routes/tokens.ts`
**FR**: FR-009

- MempoolService `registerPendingTrade()`: Read current platform_stats doc, increment in-memory, `debouncer.schedulePlatformStats(stats)`
- IndexerService `updateStats()`: After canonical recount, `debouncer.schedulePlatformStats(canonicalStats)`
- POST /v1/tokens route: After token insert, `debouncer.schedulePlatformStats(stats)` with incremented totalTokens

### 1g. Broadcast new_token from POST /v1/tokens

**Files**: `backend/src/routes/tokens.ts`
**FR**: FR-010

After successful token insertion:
```typescript
wsService.broadcast("platform", "new_token", { ...insertedToken, priceChange24hBps: 0 });
```
Payload must match TokenDetailResponse shape for `mapApiTokenToToken()` compatibility.

### 1h. Fix POST /v1/trades fallback path

**Files**: `backend/src/routes/tokens.ts`
**FR**: FR-015

When mempoolService is unavailable (line ~456), after inserting trade to DB:
- Broadcast `new_trade` on `token:trades:{tokenAddress}`
- Compute price from reserves and broadcast `price_update` on `token:price:{tokenAddress}`

### 1i. Wire HomePage components to WS events

**Files**: `frontend/src/components/home/PlatformStats.tsx`, `frontend/src/components/home/TopTokens.tsx`, `frontend/src/components/home/RecentTokens.tsx`
**FR**: FR-012, FR-016

Each component:
- Import and use callbacks from `useGlobalFeed` (via context or direct store subscription)
- PlatformStats: Update from `platform_stats_update` event. Keep 5s poll as WS-disconnected fallback.
- TopTokens / RecentTokens: React to `token_activity` (local patch price+volume on matching tokens), `new_token` (prepend if newest sort). Keep 5s poll as fallback.

### 1j. Wire TrenchesPage to WS events

**Files**: `frontend/src/pages/TrenchesPage.tsx`
**FR**: FR-016

- React to `token_activity`: patch matching tokens, schedule throttled `fetchTokens()` (max 1/2.5s)
- React to `new_token`: prepend immediately if sort is "newest"
- Keep `setInterval(fetchTokens, 5000)` as fallback
- Remove `opump:trade` listener

### 1k. Fix SellForm balance refresh

**Files**: `frontend/src/components/trade/SellForm.tsx`, `frontend/src/stores/trade-store.ts`
**FR**: FR-013

In trade-store: Add `selfTradeCounter` that increments when `addWsTrade()` receives a trade where `traderAddress === connectedAddress`.

In SellForm:
- Subscribe to `selfTradeCounter` from trade-store
- Include it in the `useEffect` deps array for the balance fetch
- Balance re-fetches whenever the counter increments

---

## Phase 2: P2 — Data Correctness

### 2a. Fix holderCount aggregation

**Files**: `backend/src/services/IndexerService.ts`
**FR**: FR-017

In `updateTokenStats()`, replace unique-buyer count with net-positive aggregation:
- Group by traderAddress
- Sum buy tokenAmounts vs sell tokenAmounts (using $toDouble)
- Count addresses where buyTotal > sellTotal

MempoolService: Use cached holderCount from last block confirmation. No expensive aggregation per trade.

### 2b. Add tradeCount24h field

**Files**: `shared/types/token.ts`, `backend/src/services/IndexerService.ts`
**FR**: FR-018

1. Add `tradeCount24h?: number` to TokenDocument interface
2. In `updateTokenStats()`: `tradeCount24h = await trades.countDocuments({ tokenAddress, createdAt: { $gte: oneDayAgo } })`
3. Store on token doc alongside existing tradeCount

### 2c. Fix graduatedAt field + backfill

**Files**: `backend/src/services/IndexerService.ts`, `shared/types/token.ts`
**FR**: FR-019

1. In `processGraduation()`: Set `graduatedAt` instead of `graduatedAtBlock`
2. Run one-time backfill on startup (or add migration script):
   - Copy `graduatedAtBlock` → `graduatedAt` where missing
   - Unset `graduatedAtBlock`

### 2d. Remove dead trade_confirmed code in processBlock()

**Files**: `backend/src/services/IndexerService.ts`
**FR**: FR-020

Remove Step 1 code in `processBlock()` (line ~142-156): The `updateMany({ status: 'pending', blockNumber })` query never matches because pending trades lack `blockNumber`. Actual confirmation happens in `processBuyEvent()`/`processSellEvent()`.

### 2e. Fix platform stats: remove MempoolService $inc on DB

**Files**: `backend/src/services/MempoolService.ts`
**FR**: FR-021

Stop `$inc`-ing `platform_stats` document from MempoolService. Instead:
- Read current doc
- Increment in-memory
- Schedule debounced broadcast only (no DB write)

IndexerService `updateStats()` remains the canonical DB writer.

### 2f. Fix mappers.ts

**Files**: `frontend/src/lib/mappers.ts`
**FR**: FR-018

- Change `tradeCount24h: t.tradeCount` → `tradeCount24h: t.tradeCount24h ?? t.tradeCount` (backward-compatible until backend deploys)
- Ensure all string-from-backend numeric fields go through `parseFloat()`

### 2g. Remove opump:trade dispatch and listeners

**Files**: `frontend/src/hooks/use-trade-simulation.ts`, `frontend/src/pages/TrenchesPage.tsx`, `frontend/src/components/home/TopTokens.tsx`, `frontend/src/components/home/RecentTokens.tsx`, `frontend/src/components/home/PlatformStats.tsx`, `frontend/src/hooks/use-price-feed.ts`
**FR**: N/A (cleanup)

- Remove `window.dispatchEvent(new CustomEvent('opump:trade'))` from `use-trade-simulation.ts`
- Remove all `window.addEventListener('opump:trade', ...)` from listed components
- Fully replaced by WS events via useGlobalFeed

### 2h. Broadcast reserve changes from syncTokenReserves

**Files**: `backend/src/services/IndexerService.ts`
**FR**: FR-023

In `syncTokenReserves()`:
- Read reserves before update
- After DB update, compare. If any changed, broadcast `price_update` with full reserves on `token:price:{addr}`

### 2i. Graduation/migration events in frontend

**Files**: `frontend/src/hooks/use-global-feed.ts`
**FR**: FR-022

In useGlobalFeed, handle:
- `token_graduated`: Update token status to 'graduated' in store
- `token_migrating`: Update to 'migrating'
- `token_migrated`: Update to 'migrated'

TokenPage: When status changes, trade panel UI adapts (already handled by existing conditional rendering).
List pages: Badge updates from store change.

### 2j. Add ProfilePage refresh

**Files**: `frontend/src/pages/ProfilePage.tsx`
**FR**: FR-024

- Add `setInterval` at 20s to refetch token list
- React to `token_activity` from global feed: if `tokenAddress` matches any held token, refetch

---

## Phase 3: P3 — Low Priority

### 3a. Migration progress broadcasts

**Files**: `backend/src/services/MigrationService.ts`
**FR**: FR-026

Broadcast `migration_progress` on `platform` channel at each step transition:
```typescript
wsService.broadcast("platform", "migration_progress", {
  tokenAddress, step, stepName, status
});
```

### 3b. Chart correction on trade_dropped

**Files**: `frontend/src/hooks/use-price-feed.ts`
**FR**: FR-027

In `trade_dropped` handler: After removing trade from store, wait 50ms then call `refreshFromServer()` to re-fetch OHLCV. The delay ensures the backend `dropTrade()` DB delete completes before the re-fetch.

### 3c. Verify priceChange24h on TokenPage

**FR**: FR-028

Manual verification: Check that `computeOptimistic24hChange` in token-store works correctly when fed live price updates.

---

## File Change Summary

### Backend — Modified

| File | Changes |
|------|---------|
| `backend/src/index.ts` | Instantiate BroadcastDebouncer, pass to services. Pass optimisticService to simulate routes. Shutdown flush. |
| `backend/src/services/MempoolService.ts` | Fix parseInt→Number. Add debouncer dependency. Broadcast token_stats + token_activity + platform_stats (in-memory, no DB $inc for platform). |
| `backend/src/services/IndexerService.ts` | Add reserves to price_update. Broadcast token_stats + platform_stats via debouncer. Fix holderCount aggregation. Add tradeCount24h. Fix graduatedAt. Remove dead trade_confirmed code. Broadcast reserve sync changes. |
| `backend/src/services/OptimisticStateService.ts` | Add MAX_PENDING cap (50). Fix error handling in getOptimisticPrice (break on error). |
| `backend/src/services/MigrationService.ts` | Broadcast migration_progress at each step. |
| `backend/src/routes/simulate.ts` | Accept optimisticService parameter. Use optimistic reserves when pending trades exist. |
| `backend/src/routes/tokens.ts` | Broadcast new_token on POST /v1/tokens. Fix fallback trade path broadcasts. |
| `shared/types/token.ts` | Add tradeCount24h field. |

### Backend — New

| File | Purpose |
|------|---------|
| `backend/src/services/BroadcastDebouncer.ts` | Per-token (2s) and per-platform (3s) debounce timers with TTL eviction. |

### Frontend — Modified

| File | Changes |
|------|---------|
| `frontend/src/App.tsx` | Add `wsClient.connect()` useEffect. Mount useGlobalFeed. |
| `frontend/src/services/websocket.ts` | Add reconnection detection (wasConnectedBefore flag, onReconnect callback). |
| `frontend/src/hooks/use-price-feed.ts` | Remove wsClient.connect(). Add token:stats subscription. Add reconnect recovery. Remove opump:trade listener. |
| `frontend/src/hooks/use-trade-simulation.ts` | Remove opump:trade dispatch. |
| `frontend/src/stores/token-store.ts` | Handle new_token, token_activity patching, status changes from WS. |
| `frontend/src/stores/trade-store.ts` | Add selfTradeCounter for SellForm balance refresh. |
| `frontend/src/lib/mappers.ts` | Fix tradeCount24h mapping. |
| `frontend/src/components/trade/SellForm.tsx` | Add selfTradeCounter dep for balance refetch. |
| `frontend/src/pages/TrenchesPage.tsx` | React to WS events via useGlobalFeed. Remove opump:trade. Throttled refetch. |
| `frontend/src/pages/ProfilePage.tsx` | Add 20s polling + token_activity reactions. |
| `frontend/src/components/home/PlatformStats.tsx` | React to platform_stats_update. Remove opump:trade. Keep polling fallback. |
| `frontend/src/components/home/TopTokens.tsx` | React to token_activity + new_token. Remove opump:trade. Keep polling fallback. |
| `frontend/src/components/home/RecentTokens.tsx` | React to token_activity + new_token. Remove opump:trade. Keep polling fallback. |

### Frontend — New

| File | Purpose |
|------|---------|
| `frontend/src/hooks/use-global-feed.ts` | Global WS subscription hook for platform channel. Handles new_token, token_activity, platform_stats_update, graduation/migration events. Reconnect recovery. |

---

## Dependency Graph

```
Phase 0 (backend-only, deploy independently):
  0a. Fix parseInt ──────────────────────────────┐
  0b. Fix simulate routes ───────────────────────┤
  0c. Fix OptimisticStateService ────────────────┤ No dependencies between these
  0d. Fix price_update reserves ─────────────────┤
  0e. Create BroadcastDebouncer ─────────────────┤
                                                  │
  0f. MempoolService stats broadcasts ───────────┼── depends on 0a + 0e
  0g. IndexerService stats broadcasts ───────────┼── depends on 0e
  0h. Wire debouncer in index.ts ────────────────┘── depends on 0e + 0f + 0g

Phase 1 (frontend + remaining backend):
  1a. Global WS connection ──────────────────────┐
  1b. Reconnection detection ────────────────────┤ No deps between these
  1d. Create useGlobalFeed ──────────────────────┤
  1f. Backend platform_stats_update ─────────────┤── depends on 0e
  1g. Backend new_token broadcast ───────────────┤
  1h. Backend fallback trade fix ────────────────┘
                                                  │
  1c. Reconnect recovery in usePriceFeed ────────┼── depends on 1b
  1e. token:stats subscription ──────────────────┼── depends on 0f/0g (backend broadcasts)
  1i. HomePage WS wiring ───────────────────────┼── depends on 1d
  1j. TrenchesPage WS wiring ──────────────────┼── depends on 1d
  1k. SellForm balance refresh ─────────────────┘

Phase 2 (data correctness):
  2a-2e: Backend fixes (independent of each other)
  2f-2g: Frontend cleanup (depends on 1d for opump:trade removal)
  2h-2j: Additional wiring (depends on Phase 1)
```

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Double broadcasts cause UI flicker | Medium | All payloads use absolute values (idempotent). Debouncer collapses rapid updates. |
| MempoolService approximate stats drift | Low | IndexerService canonical recount corrects on every block (~10min). Acceptable for mempool-first UX. |
| WS reconnection refetch storm | Low | Refetches are per-active-page, not global. Max 3-4 API calls per reconnect. |
| BroadcastDebouncer memory leak | Low | TTL eviction every 60s for inactive tokens. flush() on shutdown. |
| Frontend store race conditions (local patch + refetch) | Low | Zustand state is synchronous. Refetch replaces stale local patches with authoritative server data. |

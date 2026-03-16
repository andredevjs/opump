# Tasks: Real-Time State Propagation

**Branch**: `2-realtime-state-propagation`
**Generated**: 2026-03-16
**Total Tasks**: 42
**Spec**: `specs/2-realtime-state-propagation/spec.md`
**Plan**: `specs/2-realtime-state-propagation/plan.md`

---

## Phase 1: Foundational

Blocking prerequisites shared across multiple user stories. Must complete before any story phase.

- [x] T001 [P] Add `tradeCount24h?: number` field to TokenDocument interface in `shared/types/token.ts`. This field will be computed by IndexerService and approximated by MempoolService.
- [x] T002 [P] Create `backend/src/services/BroadcastDebouncer.ts` — new class with: `scheduleTokenStats(tokenAddress, stats)` (trailing-edge 2s per token, latest-wins), `schedulePlatformStats(stats)` (trailing-edge 3s, latest-wins), `tokenActivity(tokenAddress, data)` (immediate broadcast, no debounce). Include `evictInactive()` (runs every 60s via setInterval, clears timers for tokens with no activity for 10min), `flush()` (sends all pending data immediately), `stop()` (clears all timers). Constructor receives `wsService: WebSocketService`. Broadcasts to channels: `token:stats:{tokenAddress}` / `token_stats_update`, `platform` / `platform_stats_update`, `platform` / `token_activity`. See `specs/2-realtime-state-propagation/data-model.md` for payload interfaces and constants.
- [x] T003 Wire BroadcastDebouncer into service graph in `backend/src/index.ts`: instantiate after wsService, pass to MempoolService and IndexerService constructors (update their constructor signatures to accept debouncer), call `debouncer.flush()` and `debouncer.stop()` in graceful shutdown handler. Also pass `optimisticService` to `registerSimulateRoutes(app, optimisticService)` (currently only receives `app`).
- [x] T004 [P] Add reconnection detection to `frontend/src/services/websocket.ts`: add `_wasConnectedBefore: boolean` flag (initially false). In the `onopen` handler, after re-subscribing channels, if `_wasConnectedBefore` is true, notify connection listeners with `{ connected: true, isReconnect: true }` (extend the listener callback signature). Set `_wasConnectedBefore = true` after first successful connect. Add `onReconnect(callback): () => void` method that registers a callback firing only on reconnection (not initial connect). Returns unsubscribe function.

**Dependencies**: T003 depends on T002. All others are parallel.

---

## Phase 2: US2 — Accurate Trade Simulation (P0)

**Goal**: Simulations use optimistic reserves reflecting pending trades, with safety caps.

- [x] T005 [P] [US2] Fix OptimisticStateService pending cap in `backend/src/services/OptimisticStateService.ts`: in `addPendingTrade()`, add `const MAX_PENDING = 50;` — if `state.pendingAdjustments.length >= MAX_PENDING`, call `state.pendingAdjustments.shift()` to drop oldest before pushing new one.
- [x] T006 [P] [US2] Fix OptimisticStateService error handling in `backend/src/services/OptimisticStateService.ts`: in `getOptimisticPrice()`, change the catch block from `continue` to `break` — on simulation error, exit the pending adjustments loop and return last-known-good `currentReserves` instead of continuing with potentially corrupted state.
- [x] T007 [US2] Fix simulate routes to use optimistic reserves in `backend/src/routes/simulate.ts`: update `registerSimulateRoutes` signature to accept `optimisticService: OptimisticStateService`. In both buy and sell handlers, after fetching token doc from DB, call `optimisticService.getOptimisticPrice(tokenAddress)`. If `isOptimistic`, use returned `reserves` (which includes `kConstant`) for the simulation. Otherwise use DB reserves (current behavior). Tax BPS (`buyTaxBps`, `sellTaxBps`) still read from `token.config`. Note: T003 already updates the call site in `index.ts`.

**Dependencies**: T007 depends on T003 (wiring in index.ts). T005 and T006 are parallel, no deps.

---

## Phase 3: US3 — Confirmed Price Updates with Reserves (P0)

**Goal**: Confirmed price_update broadcasts include full reserve data for market cap and graduation progress computation.

- [x] T008 [US3] Add reserves to confirmed price_update in `backend/src/services/IndexerService.ts`: in `processBuyEvent()` and `processSellEvent()`, after `syncTokenReserves()` completes, read the updated token doc from DB via `tokens.findOne({ _id: tokenAddress })`. Include `virtualBtcReserve`, `virtualTokenSupply`, `realBtcReserve` from the updated doc in the existing `price_update` broadcast payload (currently only sends `{ currentPriceSats, isOptimistic: false }`). Also add `isOptimistic: false` explicitly. See `specs/2-realtime-state-propagation/contracts/websocket-events.md` for the updated `PriceUpdatePayload` schema.

**Dependencies**: None (independent of other phases).

---

## Phase 4: US1 — Instant Trade Visibility Across All Pages (P0)

**Goal**: Trade data (price, volume) propagates to ALL pages within 2 seconds via WS.

- [x] T009 [US1] Fix parseInt precision loss in `backend/src/services/MempoolService.ts`: replace `parseInt(btcAmount, 10) || 0` with `Number(btcAmount) || 0` at both occurrences — in `registerPendingTrade()` (~line 343) and `dropTrade()` (~line 244). `Number()` is safe for sats (total BTC supply ~2.1×10^15 < Number.MAX_SAFE_INTEGER ~9×10^15).
- [x] T010 [US1] Add stats and activity broadcasts from MempoolService in `backend/src/services/MempoolService.ts`: in `registerPendingTrade()`, after existing $inc operations: (1) read current token doc to get volume24h, volumeTotal, holderCount, marketCapSats; (2) compute approximate in-memory stats — volume24h = doc.volume24h + Number(btcAmount), volumeTotal = doc.volumeTotal + Number(btcAmount), tradeCount24h from cached count + in-memory increment, holderCount cached from last block; (3) call `this.debouncer.scheduleTokenStats(tokenAddress, stats)` (debounced 2s); (4) call `this.debouncer.tokenActivity(tokenAddress, { tokenAddress, lastPrice: pricePerToken, volume24h, btcAmount })` (immediate). In `dropTrade()`: schedule updated stats after $inc reversal. See `specs/2-realtime-state-propagation/data-model.md` for `TokenStatsPayload` and `TokenActivityPayload` schemas.
- [x] T011 [US1] Add stats broadcasts from IndexerService in `backend/src/services/IndexerService.ts`: in `updateTokenStats()`, after computing canonical stats (volume24h, volumeTotal, tradeCount, holderCount, marketCapSats) and saving to DB, call `this.debouncer.scheduleTokenStats(tokenAddress, { volume24h, volumeTotal, tradeCount, tradeCount24h, holderCount, marketCapSats })`. Also add token_activity broadcast: call `this.debouncer.tokenActivity(tokenAddress, { tokenAddress, lastPrice: token.currentPriceSats, volume24h, btcAmount: '0' })` from `processBuyEvent()`/`processSellEvent()` after updating price.
- [x] T012 [US1] Move WebSocket connection to app root in `frontend/src/App.tsx`: add `useEffect(() => { wsClient.connect(); }, [])` inside the App component. Import `wsClient` from `../services/websocket`. In `frontend/src/hooks/use-price-feed.ts`: remove the `wsClient.connect()` call (~line 185). WS is now always connected regardless of which page the user is on.
- [x] T013 [US1] Create `frontend/src/hooks/use-global-feed.ts` — new hook mounted once in App.tsx. Subscribe to `platform` channel via `wsClient.subscribe('platform', '', handler)`. Handle events: (1) `token_activity`: if `data.tokenAddress` matches any token in token-store, patch its `currentPriceSats` from `data.lastPrice` and `volume24hSats` from `data.volume24h` using token-store actions. Schedule throttled full API refetch (max 1 per 2500ms) via `setTimeout`/`clearTimeout` pattern to correct computed fields like `priceChange24hBps`. (2) `new_token`: call `mapApiTokenToToken(data)` and prepend to token-store list. (3) `platform_stats_update`: update a platform stats state (new Zustand store or extend token-store). (4) `token_graduated`/`token_migrating`/`token_migrated`: update matching token's status in store. On WS reconnect (via `wsClient.onReconnect()`): refetch platform stats + trigger token list refetch. Export the hook. Mount it in App.tsx alongside the `wsClient.connect()` useEffect.

**Dependencies**: T009 before T010. T010 and T011 depend on Phase 1 (T002 + T003 for debouncer). T012 is independent. T013 depends on T004 (reconnection detection) and T012 (global WS).

---

## Phase 5: US4 — WebSocket Reconnection Recovery (P0)

**Goal**: After connection drop, all pages auto-recover with fresh data.

- [x] T014 [US4] Add reconnection recovery to usePriceFeed in `frontend/src/hooks/use-price-feed.ts`: register `wsClient.onReconnect()` callback in the existing useEffect. On reconnect, if `token` ref is set (currently viewing a token), call `refreshFromServer()` to re-fetch price, OHLCV candles, and trades. Clean up the reconnect listener in the useEffect cleanup function.
- [x] T015 [US4] Add reconnection recovery to useGlobalFeed in `frontend/src/hooks/use-global-feed.ts`: in the `onReconnect` callback (set up in T013), refetch platform stats via API and trigger `fetchTokens()` from token-store to refresh the active token list.

**Dependencies**: T014 depends on T004 (reconnection detection). T015 depends on T013 (useGlobalFeed creation).

---

## Phase 6: US5 — Real-Time Platform Statistics (P1)

**Goal**: Homepage platform stats update within 3 seconds of any trade or token creation.

- [x] T016 [US5] Add platform_stats_update broadcasts from backend: (1) In `backend/src/services/MempoolService.ts` `registerPendingTrade()`: read current platform_stats doc from DB, increment totalTrades and totalVolumeSats in-memory, call `this.debouncer.schedulePlatformStats({ totalTokens, totalTrades, totalVolumeSats, totalGraduated })`. (2) In `backend/src/services/IndexerService.ts` `updateStats()`: after canonical recount and DB save, call `this.debouncer.schedulePlatformStats(canonicalStats)`. (3) In `backend/src/routes/tokens.ts` POST /v1/tokens: after token insertion, read platform stats, increment totalTokens in-memory, call `debouncer.schedulePlatformStats(stats)` — debouncer needs to be passed to the route (add to `registerTokenRoutes` params).
- [x] T017 [US5] Wire PlatformStats component to WS in `frontend/src/components/home/PlatformStats.tsx`: subscribe to `platform_stats_update` from the global feed store (populated by useGlobalFeed). When WS-delivered stats are available, update display immediately. Keep existing 5s `setInterval` poll as fallback for when WS is disconnected. Remove the `opump:trade` event listener.

**Dependencies**: T016 depends on Phase 1 (T002 + T003). T017 depends on T013 (useGlobalFeed).

---

## Phase 7: US6 — New Token Instant Appearance (P1)

**Goal**: Newly created tokens appear on listing pages within 2 seconds.

- [x] T018 [US6] Broadcast new_token from POST /v1/tokens in `backend/src/routes/tokens.ts`: after successful token insertion (line ~593), call `wsService.broadcast("platform", "new_token", { ...insertedToken, priceChange24hBps: 0 })`. Payload must match TokenDetailResponse shape for `mapApiTokenToToken()` compatibility. wsService needs to be passed to the route (add to `registerTokenRoutes` params if not already available).
- [x] T019 [US6] Wire TrenchesPage to WS events in `frontend/src/pages/TrenchesPage.tsx`: (1) React to `new_token` from global feed store: if current sort is "newest", prepend the new token to the displayed list. (2) React to `token_activity`: if `data.tokenAddress` matches a visible token, patch its `currentPriceSats` and `volume24hSats` locally. Schedule throttled `fetchTokens()` (max 1 per 2500ms) for full correction. (3) Keep `setInterval(fetchTokens, 5000)` as WS-disconnected fallback. (4) Remove the `opump:trade` event listener.
- [x] T020 [P] [US6] Wire TopTokens to WS in `frontend/src/components/home/TopTokens.tsx`: react to `token_activity` from global feed store — patch matching tokens' price and volume locally. React to `new_token` — no prepend needed (TopTokens sorts by volume). Keep 5s poll as fallback. Remove `opump:trade` listener.
- [x] T021 [P] [US6] Wire RecentTokens to WS in `frontend/src/components/home/RecentTokens.tsx`: react to `new_token` from global feed store — prepend new token to list. React to `token_activity` — patch matching tokens. Keep 5s poll as fallback. Remove `opump:trade` listener.

**Dependencies**: T018 is backend-only, no deps. T019-T021 depend on T013 (useGlobalFeed). T020 and T021 are parallel.

---

## Phase 8: US7 — Sell Form Balance Refresh (P1)

**Goal**: Sell form balance updates after user's own trade without page refresh.

- [x] T022 [US7] Add selfTradeCounter to trade-store in `frontend/src/stores/trade-store.ts`: add `selfTradeCounter: number` (initial 0) to store state. Add `incrementSelfTradeCounter()` action. In `addWsTrade()`, accept an optional `connectedAddress?: string` parameter — if `trade.traderAddress === connectedAddress`, call `incrementSelfTradeCounter()`.
- [x] T023 [US7] Wire SellForm to selfTradeCounter in `frontend/src/components/trade/SellForm.tsx`: subscribe to `selfTradeCounter` from trade-store via `useTradeStore(s => s.selfTradeCounter)`. Add it to the dependency array of the `useEffect` that fetches on-chain balance (~line 28-38). When counter increments, balance re-fetches automatically.

**Dependencies**: T023 depends on T022.

---

## Phase 9: US8 — Token Statistics Feed on Token Detail Page (P1)

**Goal**: Volume, holder count, trade count update in real-time on TokenPage via WS.

- [x] T024 [US8] Add token:stats subscription to usePriceFeed in `frontend/src/hooks/use-price-feed.ts`: subscribe to `token:stats:{address}` channel via `wsClient.subscribe('token', 'stats:' + address, handler)`. On `token_stats_update` event: parse payload per `TokenStatsPayload` schema, call `updateTokenStats(address, { volume24hSats: parseFloat(data.volume24h), marketCapSats: parseFloat(data.marketCapSats), tradeCount24h: data.tradeCount24h, holderCount: data.holderCount })` from token-store. Unsubscribe on cleanup.
- [x] T025 [US8] Fix fallback trade path in `backend/src/routes/tokens.ts`: in POST /v1/trades, when mempoolService is unavailable (~line 456), after inserting trade to DB: (1) broadcast `new_trade` on `token:trades:{tokenAddress}` with `{ txHash, type, traderAddress, btcAmount, tokenAmount, pricePerToken, status: 'pending' }`; (2) read token reserves from DB and compute price, then broadcast `price_update` on `token:price:{tokenAddress}` with `{ currentPriceSats, virtualBtcReserve, virtualTokenSupply, realBtcReserve, isOptimistic: false }`.

**Dependencies**: T024 depends on T010/T011 (backend broadcasts exist). T025 is backend-only, depends on T003 (wsService available in routes).

---

## Phase 10: US9 — Accurate Holder Count (P2)

**Goal**: Holder count reflects actual current holders with positive balance.

- [x] T026 [US9] Fix holderCount aggregation in `backend/src/services/IndexerService.ts` `updateTokenStats()`: replace the current unique-buyer count with a net-positive aggregation pipeline: `$group` by `traderAddress`, `$sum` buy amounts via `$cond`+`$toDouble` as `buyTotal`, `$sum` sell amounts as `sellTotal`, then `$match` where `buyTotal > sellTotal`, then `$count`. This counts addresses with net-positive token balance. `$toDouble` precision loss is acceptable for positive-vs-zero comparison. Add a code comment documenting this assumption. MempoolService continues to use cached holderCount from last block (no change there).

**Dependencies**: None (independent backend fix).

---

## Phase 11: US10 — Graduation and Migration Status Updates (P2)

**Goal**: Real-time graduation/migration status changes propagated to all pages.

- [x] T027 [US10] Handle graduation/migration events in useGlobalFeed in `frontend/src/hooks/use-global-feed.ts`: the event handlers for `token_graduated`, `token_migrating`, `token_migrated` should update the matching token's `status` field in token-store. Add `updateTokenStatus(address: string, status: TokenStatus)` action to `frontend/src/stores/token-store.ts` if not already present. TokenPage trade panel already conditionally renders based on token.status — no additional UI changes needed.
- [x] T028 [P] [US10] Fix graduatedAt field in `backend/src/services/IndexerService.ts` `processGraduation()`: change `graduatedAtBlock: blockNumber` to `graduatedAt: blockNumber`. Update the field name in `shared/types/token.ts` if it still references `graduatedAtBlock`. Add a one-time backfill that runs on IndexerService startup: `tokens.updateMany({ graduatedAtBlock: { $exists: true }, graduatedAt: { $exists: false } }, [{ $set: { graduatedAt: '$graduatedAtBlock' } }])` followed by `tokens.updateMany({ graduatedAtBlock: { $exists: true } }, { $unset: { graduatedAtBlock: '' } })`.

**Dependencies**: T027 depends on T013 (useGlobalFeed). T028 is independent backend fix.

---

## Phase 12: US11 — Profile Page Refresh (P2)

**Goal**: Profile page token prices refresh periodically and reactively.

- [x] T029 [US11] Add refresh to ProfilePage in `frontend/src/pages/ProfilePage.tsx`: add `setInterval` at 20s that re-calls the token fetch for the user's created tokens and holdings. Also subscribe to `token_activity` events from the global feed store — if `data.tokenAddress` matches any token in the user's holdings or created tokens, trigger an immediate refetch. Clean up interval and subscription on unmount.

**Dependencies**: Depends on T013 (useGlobalFeed for token_activity).

---

## Phase 13: Data Correctness & Cleanup (P2)

Backend and frontend fixes for data integrity. Independent of each other.

- [x] T030 [P] Add tradeCount24h computation to `backend/src/services/IndexerService.ts` `updateTokenStats()`: after existing trade count, add `const tradeCount24h = await trades.countDocuments({ tokenAddress, createdAt: { $gte: new Date(Date.now() - 86400000) } })`. Include in the `$set` update alongside existing fields. MempoolService approximates by incrementing from last known count in-memory.
- [x] T031 [P] Remove dead trade_confirmed code in `backend/src/services/IndexerService.ts` `processBlock()`: remove Step 1 code (~lines 142-156) — the `updateMany({ status: 'pending', blockNumber })` query never matches because pending trades lack `blockNumber`. Actual confirmation is handled correctly by `processBuyEvent()`/`processSellEvent()` in Step 4 which broadcast `new_trade` with `status: 'confirmed'`.
- [x] T032 [P] Fix platform stats race condition in `backend/src/services/MempoolService.ts`: stop `$inc`-ing the `platform_stats` document from MempoolService. Instead: read current platform_stats doc, increment in-memory, schedule debounced broadcast only (no DB write for platform stats from mempool). IndexerService `updateStats()` remains the canonical DB writer. This fixes the `$inc` on string `totalVolumeSats` bug and the mempool/block race condition.
- [x] T033 [P] Broadcast reserve changes from syncTokenReserves in `backend/src/services/IndexerService.ts`: in `syncTokenReserves()`, before the DB update, read current reserves from the token doc. After DB update with new on-chain reserves, compare old vs new. If any reserve field changed (`virtualBtcReserve`, `virtualTokenSupply`, `realBtcReserve`), broadcast `price_update` on `token:price:{tokenAddress}` with the new reserves and `isOptimistic: false`.
- [x] T034 [P] Fix mappers.ts in `frontend/src/lib/mappers.ts`: change `tradeCount24h: t.tradeCount` to `tradeCount24h: t.tradeCount24h ?? t.tradeCount` (backward-compatible). Ensure `volume24h` and `volumeTotal` string-from-backend fields go through `parseFloat()` for numeric conversion. Ensure `totalVolumeSats` is handled as `Number(s.totalVolumeSats)` where consumed.
- [x] T035 Remove opump:trade dispatch from `frontend/src/hooks/use-trade-simulation.ts`: remove the `window.dispatchEvent(new CustomEvent('opump:trade'))` calls in `executeBuy()` (~line 134) and `executeSell()` (~line 235). This custom event is fully replaced by WS events via useGlobalFeed.
- [x] T036 Remove opump:trade listeners from all components: (1) `frontend/src/pages/TrenchesPage.tsx` — remove `window.addEventListener('opump:trade', ...)` if not already removed in T019. (2) `frontend/src/components/home/TopTokens.tsx` — remove listener if not removed in T020. (3) `frontend/src/components/home/RecentTokens.tsx` — remove if not removed in T021. (4) `frontend/src/components/home/PlatformStats.tsx` — remove if not removed in T017. (5) `frontend/src/hooks/use-price-feed.ts` — remove `opump:trade` event listener (~lines 308-309).

**Dependencies**: T030-T034 are all parallel backend fixes with no interdependencies. T035 is independent. T036 depends on T017, T019, T020, T021 (WS wiring must be in place before removing opump:trade fallback).

---

## Phase 14: Low Priority (P3)

- [x] T037 [P] Broadcast migration_progress from `backend/src/services/MigrationService.ts`: at each step transition in the migration state machine (stepMintTokens, stepCreatePool, stepListLiquidity, stepComplete), broadcast `migration_progress` on `platform` channel with payload `{ tokenAddress, step: 1|2|3|4, stepName, status: 'started'|'completed'|'failed' }`. See `specs/2-realtime-state-propagation/contracts/websocket-events.md` for schema.
- [x] T038 [P] Add chart correction on trade_dropped in `frontend/src/hooks/use-price-feed.ts`: in the `trade_dropped` event handler, after removing the trade from trade-store, wait 50ms (`setTimeout`) then call `refreshFromServer()` to re-fetch OHLCV candles. The delay ensures the backend `dropTrade()` DB delete completes before the re-fetch queries the DB.
- [x] T039 [P] Verify priceChange24h on TokenPage: manual verification task — confirm that the existing `computeOptimistic24hChange` logic in token-store produces correct 24h price change values when receiving live `price_update` events from WS. If broken, fix the computation.

**Dependencies**: T037-T039 are all parallel and independent.

---

## Phase 15: Final Validation

- [ ] T040 Validate P0 acceptance scenarios: test US1-US4 per `specs/2-realtime-state-propagation/quickstart.md` Phase 0 and Phase 1 validation sections. Verify: (1) trades visible across all pages within 2s, (2) simulation accounts for pending trades, (3) confirmed price_update includes reserves, (4) WS reconnection recovers data within 5s.
- [ ] T041 Validate P1 acceptance scenarios: test US5-US8 per quickstart.md. Verify: (1) platform stats update within 3s, (2) new tokens appear within 2s, (3) sell form balance refreshes after buy, (4) token detail page stats update via WS.
- [ ] T042 Validate P2 acceptance scenarios: test US9-US11 per quickstart.md. Verify: (1) holder count decreases on full sell, (2) graduation status propagates, (3) profile page refreshes.

**Dependencies**: T040 depends on Phases 2-5. T041 depends on Phases 6-9. T042 depends on Phases 10-13.

---

## Task Summary

| Phase | Story | Tasks | Task IDs |
|-------|-------|-------|----------|
| 1: Foundational | — | 4 | T001-T004 |
| 2: US2 Simulation | P0 | 3 | T005-T007 |
| 3: US3 Reserves | P0 | 1 | T008 |
| 4: US1 Visibility | P0 | 5 | T009-T013 |
| 5: US4 Reconnection | P0 | 2 | T014-T015 |
| 6: US5 Platform Stats | P1 | 2 | T016-T017 |
| 7: US6 New Token | P1 | 4 | T018-T021 |
| 8: US7 Sell Balance | P1 | 2 | T022-T023 |
| 9: US8 Stats Feed | P1 | 2 | T024-T025 |
| 10: US9 Holders | P2 | 1 | T026 |
| 11: US10 Graduation | P2 | 2 | T027-T028 |
| 12: US11 Profile | P2 | 1 | T029 |
| 13: Cleanup | P2 | 7 | T030-T036 |
| 14: Low Priority | P3 | 3 | T037-T039 |
| 15: Validation | — | 3 | T040-T042 |
| **Total** | | **42** | |

## Parallel Opportunities

Tasks marked `[P]` can run in parallel with other tasks in the same phase:
- **Phase 1**: T001, T002, T004 are fully parallel (different files, no deps)
- **Phase 2**: T005, T006 parallel (same file but different functions)
- **Phase 7**: T020, T021 parallel (different component files)
- **Phase 13**: T030-T035 are all parallel (independent fixes across files)
- **Phase 14**: T037-T039 all parallel

## Dependency Chain (Critical Path)

```
T002 (BroadcastDebouncer) → T003 (wire into index.ts) → T010 (Mempool broadcasts) → T024 (frontend stats sub)
T004 (reconnect detection) → T013 (useGlobalFeed) → T019 (TrenchesPage) → T036 (remove opump:trade)
T012 (global WS) → T013 (useGlobalFeed) → T017 (PlatformStats) ─┐
                                          → T019 (TrenchesPage)  ├→ T036 (cleanup)
                                          → T020 (TopTokens)     │
                                          → T021 (RecentTokens)  ┘
```

## MVP Scope

**Minimum viable increment**: Phase 1 (Foundational) + Phase 2 (US2) + Phase 3 (US3) + Phase 4 (US1) = **T001-T013** (13 tasks).

This delivers:
- Global WS connection on all pages
- Accurate trade simulations with pending trades
- Confirmed price updates with reserves
- Real-time stats and activity broadcasts
- useGlobalFeed hook with token_activity handling

All other pages (Homepage, TrenchesPage, SellForm, ProfilePage) can be wired incrementally after the MVP.

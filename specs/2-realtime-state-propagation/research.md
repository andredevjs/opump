# Research: Real-Time State Propagation

**Date**: 2026-03-16

## Current Architecture Snapshot

### Backend Services (Node.js + HyperExpress + MongoDB)

| Service | File | Lines | Role |
|---------|------|-------|------|
| WebSocketService | `backend/src/services/WebSocketService.ts` | 180 | Channel-agnostic pub/sub over WS. Max 1000 connections, 50 subs/client. |
| MempoolService | `backend/src/services/MempoolService.ts` | 362 | Polls OPNet mempool, registers pending trades, detects drops. |
| IndexerService | `backend/src/services/IndexerService.ts` | 706 | Confirms trades on block, syncs reserves, computes canonical stats. |
| OptimisticStateService | `backend/src/services/OptimisticStateService.ts` | 137 | In-memory pending trade simulation for optimistic pricing. |
| MigrationService | `backend/src/services/MigrationService.ts` | 454 | 4-step token graduation migration to NativeSwap DEX. |

### Frontend (React 18 + Vite + Zustand)

| Component/Hook | File | Lines | Role |
|----------------|------|-------|------|
| wsClient | `frontend/src/services/websocket.ts` | 179 | WS singleton with reconnect (1s→30s backoff), channel subscribe/unsubscribe. |
| usePriceFeed | `frontend/src/hooks/use-price-feed.ts` | 359 | **Only WS consumer.** Subscribes token:price + token:trades. Calls wsClient.connect(). |
| useTradeSimulation | `frontend/src/hooks/use-trade-simulation.ts` | 262 | Trade execution. Dispatches opump:trade custom event. |
| token-store | `frontend/src/stores/token-store.ts` | 145 | Zustand: tokens, selectedToken, filter. updateTokenStats() accepts all stat fields. |
| trade-store | `frontend/src/stores/trade-store.ts` | 160 | Zustand: pendingTxs, holdings, recentTrades (WsTrade[]). |
| price-store | `frontend/src/stores/price-store.ts` | 113 | Zustand: candles, livePrices, timeframes. |

### Current WS Channel Map

| Channel | Events | Source | Consumers |
|---------|--------|--------|-----------|
| `token:price:{addr}` | price_update, token_graduated, token_migrating, token_migrated | Mempool/Indexer/Migration | usePriceFeed (TokenPage only) |
| `token:trades:{addr}` | new_trade, trade_confirmed, trade_dropped | Mempool/Indexer | usePriceFeed (TokenPage only) |
| `platform` | token_graduated, token_migrating, token_migrated | Indexer/Migration | Nobody subscribes |
| `block` | new_block | Indexer | Nobody subscribes |

### Current Polling Map

| Component | Interval | Event Listener | WS? |
|-----------|----------|----------------|-----|
| TokenPage (via usePriceFeed) | 5s fallback | opump:trade | YES |
| TrenchesPage | 5s | opump:trade | NO |
| PlatformStats | 5s | opump:trade | NO |
| TopTokens | 5s | opump:trade | NO |
| RecentTokens | 5s | opump:trade | NO |
| ProfilePage | never | none | NO |
| SellForm | one-time fetch | none | NO |

## Key Decisions

### D1: parseInt → Number() for sats conversion
- **Decision**: Use `Number()` not `BigInt()` for sats amounts in MempoolService
- **Rationale**: Total BTC supply = ~2.1×10^15 sats. `Number.MAX_SAFE_INTEGER` = ~9×10^15. Safe margin of ~4x. BigInt adds complexity for $inc operations with no practical benefit.
- **Alternatives considered**: BigInt (unnecessary complexity), parseFloat (same precision as Number for integers)

### D2: Debounce strategy — trailing-edge with latest-wins
- **Decision**: BroadcastDebouncer uses trailing-edge timers. Each new event for same token/platform replaces pending data, timer resets to full interval.
- **Rationale**: Ensures latest absolute values are always what gets broadcast. No stale intermediate values. Simple to implement and reason about.
- **Alternatives considered**: Leading-edge (sends stale data first), buffered batch (unnecessary complexity for absolute-value payloads)

### D3: Frontend local-patch + throttled-refetch for listing pages
- **Decision**: token_activity provides immediate local patch (price + volume). Throttled full API refetch (max 1/2-3s) corrects computed fields (priceChange24hBps).
- **Rationale**: Best UX — instant visual update for the fields we have, async correction for server-computed fields. No visible stale window for primary metrics.
- **Alternatives considered**: WS-only (can't compute priceChange24hBps client-side), refetch-only (2-3s delay for all fields)

### D4: No new WS channels needed for platform events
- **Decision**: Reuse existing `platform` channel for new_token, token_activity, platform_stats_update events.
- **Rationale**: WebSocketService is channel-agnostic. `platform` channel already exists for graduation/migration events. Adding events to it requires zero backend changes to WebSocketService.

### D5: token:stats:{addr} as new channel
- **Decision**: Create `token:stats:{addr}` channel for per-token stat updates (separate from price_update on token:price:{addr}).
- **Rationale**: Separation of concerns. Stats are debounced (2s), prices are immediate. Different consumers may want one but not the other. WebSocketService handles any string as channel — no code changes needed.

## Confirmed Bugs

1. **parseInt truncation** — MempoolService lines 343, 244: `parseInt(btcAmount, 10)` truncates to 32-bit integer for values > 2^31 (~21.5 BTC). Fix: `Number(btcAmount) || 0`.
2. **$inc on string field** — `platformStats.totalVolumeSats` is a string in the DB but MempoolService $inc's it with a number. MongoDB silently converts, but the value becomes a number type. IndexerService recounts from aggregation, so drift is corrected on block.
3. **Simulate ignores pending trades** — simulate.ts reads DB reserves, not optimistic. registerSimulateRoutes(app) receives no services.
4. **OptimisticStateService error swallowing** — getOptimisticPrice() catches simulation errors and continues with corrupted currentReserves.
5. **Dead trade_confirmed code** — processBlock() Step 1 queries `{ status: 'pending', blockNumber }` which never matches.
6. **graduatedAtBlock vs graduatedAt** — processGraduation() sets `graduatedAtBlock`, shared type expects `graduatedAt`.
7. **holderCount = unique buyers** — updateTokenStats() counts distinct traderAddress on buy trades only. Sellers not subtracted.
8. **Fallback POST /v1/trades path** — No broadcasts, no optimistic state, no stat updates when mempoolService unavailable.
9. **No pending trade cap** — Unbounded pendingAdjustments array in OptimisticStateService.

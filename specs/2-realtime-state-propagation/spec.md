# Feature Specification: Real-Time State Propagation

**Feature Branch**: `2-realtime-state-propagation`
**Created**: 2026-03-16
**Status**: Draft
**Target Deployment**: Direct backend (HyperExpress + WebSocket). Netlify/Redis deployment is out of scope.

## Problem Statement

The platform claims mempool-first design but delivers a fragmented real-time experience. Most trading data (volume, holders, trades, prices, charts) only updates after block confirmation or via slow polling. WebSocket only connects on a single page. Users on listing pages, the homepage, and profile pages see stale data for 5+ seconds. Simulated trade previews use stale reserves when pending trades exist, giving users wrong estimates. Several statistics never update in real-time at all.

## User Scenarios & Testing

### User Story 1 — Instant Trade Visibility Across All Pages (Priority: P0)

As a trader browsing the token listing page, I see every trade (mine and others') reflected in price, volume, and trade count within 2 seconds of mempool detection, without refreshing the page.

**Why this priority**: Core value proposition. Users currently see stale data for 5+ seconds on every page except token detail. This makes the platform feel broken and erodes trust in displayed prices.

**Independent Test**: Open two browser tabs — one on token detail, one on token listing. Execute a trade. Both tabs MUST reflect the updated price and volume within 2 seconds.

**Acceptance Scenarios**:
1. **Given** a user is viewing the token listing page, **When** any trader executes a buy/sell on any listed token, **Then** the affected token's price and volume update within 2 seconds without page refresh.
2. **Given** a user is on the homepage, **When** a trade occurs on any token, **Then** platform-wide statistics (total trades, total volume) update within 3 seconds.
3. **Given** a user is on any page, **When** the WebSocket connection is established, **Then** all real-time data feeds are active (not just on the token detail page).

### User Story 2 — Accurate Trade Simulation with Pending Trades (Priority: P0)

As a trader about to buy or sell, I see an accurate preview of my trade outcome that accounts for all pending (unconfirmed) trades ahead of me, so I can make informed decisions.

**Why this priority**: Wrong trade estimates directly cost users money. Current simulations use stale reserves, ignoring pending trades.

**Independent Test**: Submit a buy trade, then immediately simulate a second buy before the first confirms. The second simulation MUST show the post-first-trade price, not the pre-trade price.

**Acceptance Scenarios**:
1. **Given** there are pending trades on a token, **When** a user requests a trade simulation, **Then** the simulation uses optimistic reserves (reflecting all pending trades) instead of last-confirmed reserves.
2. **Given** 50+ pending trades exist for a token, **When** a user requests a simulation, **Then** the system caps computation at 50 pending trades (dropping oldest) and returns a result without timeout.
3. **Given** a pending trade simulation fails internally, **When** computing optimistic price, **Then** the system returns the last successfully computed reserves instead of silently corrupting subsequent calculations.

### User Story 3 — Confirmed Price Updates Include Full Reserve Data (Priority: P0)

As a trader on the token detail page, I see accurate graduation progress and market cap that reflect confirmed on-chain state, not just a price number.

**Why this priority**: Without reserves in confirmed price broadcasts, the frontend cannot compute graduation progress or market cap from WebSocket events. Users see stale graduation bars.

**Independent Test**: Confirm a trade on-chain. The token detail page MUST update graduation progress and market cap without polling or page refresh.

**Acceptance Scenarios**:
1. **Given** a trade is confirmed on-chain, **When** the confirmation is processed, **Then** the price update broadcast includes full reserve data (virtual BTC reserve, virtual token supply, real BTC reserve).
2. **Given** reserve data changes during on-chain sync, **When** reserves differ from previous values, **Then** a price update is broadcast with the new reserves.

### User Story 4 — WebSocket Reconnection Recovery (Priority: P0)

As a user whose connection temporarily drops (network switch, laptop sleep), I automatically reconnect and see current data without needing to refresh the page.

**Why this priority**: Without reconnection recovery, any brief network interruption leaves the user with permanently stale data until manual refresh. Events during the gap are lost.

**Independent Test**: Open token detail page. Disconnect network for 10 seconds. Reconnect. Within 5 seconds of reconnection, all displayed data MUST match current server state.

**Acceptance Scenarios**:
1. **Given** a WebSocket disconnects and reconnects, **When** the reconnection completes, **Then** the system automatically refetches all data relevant to the active page (prices, trades, stats, charts).
2. **Given** a user is on a listing page during reconnection, **When** reconnection completes, **Then** the token list refetches and platform stats refresh.
3. **Given** the WebSocket has never connected (first page load), **When** the connection status component renders, **Then** no disconnect warning is shown (warning only appears after a successful connection is lost).

### User Story 5 — Real-Time Platform Statistics (Priority: P1)

As a visitor on the homepage, I see live platform-wide statistics (total tokens, total trades, total volume, total graduated) that update as activity happens, giving a sense of platform liveness.

**Why this priority**: Stale homepage stats make the platform look inactive. New users judge platform health by visible activity.

**Independent Test**: Open homepage. Create a new token or execute a trade. Platform stats MUST update within 3 seconds.

**Acceptance Scenarios**:
1. **Given** a user is viewing the homepage, **When** a new token is created, **Then** total token count increments within 3 seconds.
2. **Given** a user is viewing the homepage, **When** a trade is executed, **Then** total trades and total volume update within 3 seconds.
3. **Given** the WebSocket is disconnected, **When** the homepage is displayed, **Then** a polling fallback refreshes stats every 5 seconds.

### User Story 6 — New Token Appears Instantly on Listing Pages (Priority: P1)

As a trader watching the listing page sorted by "newest," I see newly created tokens appear at the top immediately, so I can be first to trade.

**Why this priority**: Speed-to-discovery is a key competitive advantage for traders. Currently new tokens only appear after the next 5-second poll.

**Independent Test**: Open listing page sorted by newest. Create a new token. The token MUST appear at the top within 2 seconds.

**Acceptance Scenarios**:
1. **Given** a user is on the listing page sorted by "newest," **When** a new token is created, **Then** it appears at the top of the list within 2 seconds.
2. **Given** a user is on the homepage, **When** a new token is created, **Then** the "Recent Tokens" section includes it within 2 seconds.

### User Story 7 — Sell Form Balance Refreshes After Trade (Priority: P1)

As a trader who just bought tokens, I can immediately sell some of my new balance without refreshing the page.

**Why this priority**: Frozen balance after buy forces manual page refresh, breaking the fast-trading workflow.

**Independent Test**: Buy tokens on token detail page. Switch to sell tab. Available balance MUST reflect the newly purchased tokens without page refresh.

**Acceptance Scenarios**:
1. **Given** a user just completed a buy trade, **When** they view the sell form, **Then** their on-chain token balance refreshes to reflect the new holding.
2. **Given** another user sends tokens to the connected wallet, **When** a trade event is detected for the connected address, **Then** the sell form balance updates.

### User Story 8 — Token Statistics Feed on Token Detail Page (Priority: P1)

As a trader on the token detail page, I see volume, holder count, and trade count update in real-time alongside price, not just on page load.

**Why this priority**: Currently these stats only load once from the API. Traders rely on volume and holder count to make decisions.

**Independent Test**: Open token detail page. Execute multiple trades from another browser. Volume, trade count, and holder count MUST update without refresh.

**Acceptance Scenarios**:
1. **Given** a user is on the token detail page, **When** trades occur on that token, **Then** volume (24h and total), trade count, and holder count update within 2 seconds.
2. **Given** the debouncer collapses multiple rapid updates, **When** stats are broadcast, **Then** the latest absolute values are sent (not stale intermediate values).

### User Story 9 — Accurate Holder Count (Priority: P2)

As a trader evaluating a token, I see a holder count that reflects actual current holders (accounts with positive balance), not just a count of unique buyers.

**Why this priority**: Inflated holder count (never subtracts sellers) misleads traders about token distribution. Data correctness issue.

**Independent Test**: Buy tokens with wallet A. Sell all tokens from wallet A. Holder count MUST decrease by 1.

**Acceptance Scenarios**:
1. **Given** a trader sells their entire token balance, **When** holder count is recalculated on block confirmation, **Then** the count decreases.
2. **Given** many trades occur between blocks, **When** mempool service reports holder count, **Then** it uses the cached count from the last confirmed block (not an expensive real-time aggregation).

### User Story 10 — Graduation and Migration Status Updates (Priority: P2)

As a trader watching a token approach graduation, I see real-time status changes (graduated, migrating, migrated) and migration progress without page refresh.

**Why this priority**: Graduation is a high-stakes moment. Traders need to know immediately when a token graduates and migration status changes.

**Independent Test**: Trigger a graduation event. Token detail page MUST show status change. Listing pages MUST update the token's badge.

**Acceptance Scenarios**:
1. **Given** a token graduates, **When** the graduation event fires, **Then** the token detail page shows the updated status and disables/modifies the trade panel.
2. **Given** a token is migrating, **When** migration progress events fire, **Then** the user sees intermediate progress (not just start/end).
3. **Given** a user is on a listing page, **When** a token graduates, **Then** its badge updates.

### User Story 11 — Profile Page Token Prices Refresh (Priority: P2)

As a user viewing my profile/holdings, I see reasonably current token prices for my portfolio, not just the prices from when I first loaded the page.

**Why this priority**: Currently the profile page fetches once and never refreshes. Users see outdated portfolio values.

**Independent Test**: Open profile page. Execute trades on held tokens from another browser. Prices MUST update within 30 seconds.

**Acceptance Scenarios**:
1. **Given** a user is viewing their profile, **When** trades occur on tokens they hold, **Then** token prices refresh within 15-30 seconds.
2. **Given** the WebSocket delivers a trade event matching a held token, **Then** the price updates immediately.

### User Story 12 — Chart Correction on Dropped Trades (Priority: P3)

As a trader viewing the price chart, I see candle data corrected when a pending trade is dropped from the mempool, so I don't make decisions based on phantom price movements.

**Why this priority**: Phantom candles from dropped trades are misleading but relatively rare. Lower priority than ensuring all data flows work.

**Independent Test**: Submit a trade that gets dropped. The chart MUST re-fetch and remove the phantom candle.

**Acceptance Scenarios**:
1. **Given** a pending trade is dropped, **When** the drop event fires, **Then** the chart re-fetches OHLCV data within 1 second to remove phantom candle data.

### Edge Cases

- What happens when 50+ pending trades exist for a single token? System caps at 50, drops oldest.
- What happens when WebSocket and polling both deliver the same update? All payloads are absolute values (idempotent), so duplicates are harmless.
- What happens when MempoolService and IndexerService both broadcast stats for the same trade? Debouncer collapses them; frontend receives absolute values.
- What happens during a network partition where mempool trades are processed but blocks are delayed? Mempool-first updates continue. Block confirmation corrects any drift when connectivity resumes.
- What happens if the platform stats document has string fields that are incremented numerically? System uses in-memory computation instead of database $inc on strings.
- What happens when a user opens 10 browser tabs? Each tab opens a separate WebSocket connection (up to MAX_CONNECTIONS = 1000 limit). Acceptable at current scale.

## Requirements

### Functional Requirements

#### P0 — Critical

- **FR-001**: System MUST establish the WebSocket connection at application root level, active on all pages (not just the token detail page).
- **FR-002**: System MUST detect WebSocket reconnection and automatically refetch all data relevant to the active page.
- **FR-003**: System MUST broadcast trade statistics (volume, holder count, trade count) via WebSocket with a maximum debounce of 2 seconds per token.
- **FR-004**: System MUST include full reserve data (virtual BTC reserve, virtual token supply, real BTC reserve) in confirmed price update broadcasts.
- **FR-005**: System MUST use optimistic reserves (reflecting pending trades) when computing trade simulations, not stale confirmed reserves.
- **FR-006**: System MUST cap pending trade processing at 50 per token to prevent computation timeouts.
- **FR-007**: System MUST handle simulation failures gracefully by returning the last successfully computed reserves.
- **FR-008**: System MUST use safe numeric conversion for sats amounts (no integer truncation for values that may exceed 2^31).

#### P1 — High

- **FR-009**: System MUST broadcast platform-wide statistics via WebSocket with a maximum debounce of 3 seconds.
- **FR-010**: System MUST broadcast a new token event when a token is created, with a payload compatible with existing frontend data mappers.
- **FR-011**: System MUST broadcast a lightweight activity signal on every trade so listing pages can locally patch displayed data.
- **FR-012**: System MUST provide a polling fallback (5-second interval) for all data when WebSocket is disconnected.
- **FR-013**: System MUST refetch on-chain token balance after a trade event involving the connected wallet address.
- **FR-014**: System MUST allow the token stats feed (volume, holders, trade count) to be received on the token detail page via WebSocket.
- **FR-015**: System MUST broadcast trade events from the fallback trade submission path (when mempool service is unavailable).
- **FR-016**: Listing pages MUST immediately patch displayed token price and volume from lightweight activity signals, with a throttled full refetch (max 1 per 2-3 seconds) for fields that require server computation (e.g., 24-hour price change).

#### P2 — Medium

- **FR-017**: System MUST compute holder count as accounts with net-positive balance (buys minus sells), not unique buyers.
- **FR-018**: System MUST provide a separate 24-hour trade count field (distinct from all-time trade count).
- **FR-019**: System MUST use a consistent field name for graduation timestamp across backend and frontend.
- **FR-020**: System MUST remove dead code paths that never match (pending trade confirmation query).
- **FR-021**: System MUST avoid direct database increments for platform statistics from mempool events (use in-memory computation, canonical database writes only from confirmed blocks).
- **FR-022**: System MUST broadcast graduation, migration start, and migration completion events on a global channel.
- **FR-023**: System MUST broadcast reserve changes detected during on-chain sync.
- **FR-024**: System MUST refresh profile page token prices periodically (15-30 seconds) and reactively on matching trade events.
- **FR-025**: System MUST handle the `btcAmount` field as a string throughout (parsing to number only for display) to avoid overflow.

#### P3 — Low

- **FR-026**: System SHOULD broadcast intermediate migration progress steps (not just start/end).
- **FR-027**: System SHOULD re-fetch chart data when a pending trade is dropped to remove phantom candles.
- **FR-028**: System SHOULD verify that the client-side 24-hour price change computation works correctly on the token detail page.

### Non-Functional Requirements

- **NFR-001**: Debounced broadcasts MUST NOT exceed 1 message per 2 seconds per token for stats, and 1 per 3 seconds for platform stats.
- **NFR-002**: Inactive token debounce timers MUST be evicted after 10 minutes of no activity to prevent memory leaks.
- **NFR-003**: All debounce timers MUST flush pending data on server shutdown.
- **NFR-004**: WebSocket reconnection and data refetch MUST complete within 5 seconds of network restoration.
- **NFR-005**: All broadcast payloads MUST use absolute values (not increments) to ensure idempotent handling.

### Key Entities

- **Token**: Tradeable asset on the bonding curve. Key real-time attributes: currentPriceSats, volume24h, volumeTotal, holderCount, tradeCount, tradeCount24h, marketCapSats, graduation progress, reserves (virtualBtcReserve, virtualTokenSupply, realBtcReserve, kConstant).
- **Trade**: Buy or sell transaction. Status flow: pending (mempool) → confirmed (1 block) → [dropped if removed from mempool]. Key attributes: txHash, type, traderAddress, btcAmount, tokenAmount, pricePerToken, status.
- **Platform Stats**: Aggregate metrics across all tokens: totalTokens, totalTrades, totalVolumeSats, totalGraduated.
- **Optimistic State**: In-memory representation of what reserves would be if all pending trades confirm. Used for accurate trade simulations. Capped at 50 pending adjustments per token.
- **Broadcast Debouncer**: Rate-limiting mechanism for WebSocket broadcasts. Per-token timers (2s) and per-platform timer (3s) with TTL-based eviction (10min inactive).

### Assumptions

- The direct backend deployment (HyperExpress + WebSocket) is the target. Netlify/Redis deployment real-time is out of scope.
- `Number()` is safe for sats conversion (total BTC supply fits within Number.MAX_SAFE_INTEGER).
- MongoDB `$toDouble` precision loss above 2^53 sats (~900M BTC) is acceptable given total BTC supply is ~21M BTC.
- Double broadcasts (from both MempoolService and IndexerService for the same trade) are acceptable because payloads use absolute values.
- 24-hour price change on listing pages may be up to 3 seconds stale between refetches — acceptable tradeoff.
- WebSocket connection limit of 1000 is sufficient for current scale.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Trade data (price, volume) propagates to ALL connected pages within 2 seconds of mempool detection (down from 5+ seconds or never).
- **SC-002**: Trade simulations return results within 200ms even with 50 pending trades on a token.
- **SC-003**: WebSocket reconnection restores full data freshness within 5 seconds of network restoration, with zero manual page refreshes required.
- **SC-004**: Platform statistics on the homepage update within 3 seconds of any trade or token creation.
- **SC-005**: Holder count decreases when a trader sells their entire balance (currently only increases).
- **SC-006**: No numeric precision loss for sats amounts in trade processing (eliminates parseInt truncation bug).
- **SC-007**: Sell form balance reflects post-trade holdings without page refresh.
- **SC-008**: New tokens appear on listing pages within 2 seconds of creation.
- **SC-009**: Zero stale-data page refreshes needed during a normal trading session (all pages self-update via WebSocket).

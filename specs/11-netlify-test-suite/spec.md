# Feature Specification: Netlify Functions Test Suite

**Feature Branch**: `11-netlify-test-suite`
**Created**: 2026-03-19
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Health & Connectivity (Priority: P1)
As a developer, I want to verify that the health endpoints correctly report system status so that I can trust monitoring in production.
**Why this priority**: Health checks are the foundation of observability — if these lie, nothing else can be trusted.
**Independent Test**: Call `/api/health` and `/api/health/debug` with Redis available and unavailable; verify correct status reporting.
**Acceptance Scenarios**:
1. **Given** Redis is reachable, **When** GET `/api/health`, **Then** response is `{ status: "ok" }` with 200
2. **Given** Redis is unreachable, **When** GET `/api/health`, **Then** response indicates error status
3. **Given** Redis has data, **When** GET `/api/health/debug`, **Then** all check sections (env, redis, data, sampleToken) report healthy
4. **Given** Redis is empty, **When** GET `/api/health/debug`, **Then** data/sampleToken checks reflect empty state without crashing

---

### User Story 2 — Token Lifecycle (Priority: P1)
As a developer, I want to verify the full token creation → listing → detail flow so that tokens appear correctly after registration.
**Why this priority**: Token creation is the core user action — if it breaks, the entire platform is unusable.
**Independent Test**: Create a token via POST, then verify it appears in list, detail, and price endpoints.
**Acceptance Scenarios**:
1. **Given** valid token data, **When** POST `/api/v1/tokens`, **Then** 201 with complete TokenDocument including initial bonding curve reserves
2. **Given** missing required fields (name, symbol, contractAddress, creatorAddress, deployTxHash), **When** POST, **Then** 400 with descriptive error
3. **Given** field length violations (name > 50, symbol > 10, description > 500), **When** POST, **Then** 400
4. **Given** invalid address format, **When** POST, **Then** 400
5. **Given** duplicate contractAddress, **When** POST, **Then** 409 conflict
6. **Given** token exists, **When** GET `/api/v1/tokens/:address`, **Then** full token document returned
7. **Given** token does not exist, **When** GET `/api/v1/tokens/:address`, **Then** 404
8. **Given** multiple tokens exist, **When** GET `/api/v1/tokens` with pagination params, **Then** correct page/limit/total/totalPages
9. **Given** tokens exist, **When** GET `/api/v1/tokens?search=NAME`, **Then** only matching tokens returned
10. **Given** tokens exist with different statuses, **When** GET `/api/v1/tokens?status=active`, **Then** only active tokens returned
11. **Given** token exists, **When** GET `/api/v1/tokens/:address/price`, **Then** currentPriceSats, reserves, and change24hBps returned

---

### User Story 3 — Trade Simulation (Priority: P1)
As a developer, I want to verify buy/sell simulations return accurate bonding curve math so that users see correct previews before trading.
**Why this priority**: Incorrect simulations lead to unexpected slippage, user losses, and trust erosion.
**Independent Test**: Seed a token with known reserves, simulate buys/sells at various amounts, verify math against the bonding curve formula.
**Acceptance Scenarios**:
1. **Given** token with known reserves, **When** POST `/api/v1/simulate/buy` with valid btcAmountSats, **Then** tokensOut, fees, priceImpact, newPrice, effectivePrice are mathematically correct
2. **Given** token with known reserves, **When** POST `/api/v1/simulate/sell` with valid tokenAmount, **Then** btcOut, fees, priceImpact are correct
3. **Given** non-existent tokenAddress, **When** simulate buy or sell, **Then** 404
4. **Given** graduated token, **When** simulate buy, **Then** error indicating token is graduated
5. **Given** buy amount that would exceed graduation threshold, **When** simulate buy, **Then** appropriate error
6. **Given** btcAmountSats below minimum, **When** simulate buy, **Then** 400 error
7. **Given** sell amount exceeding available supply, **When** simulate sell, **Then** appropriate error

---

### User Story 4 — Trade Submission (Mempool-First) (Priority: P1)
As a developer, I want to verify that trade submissions create pending trades and update state optimistically so that the mempool-first architecture works correctly.
**Why this priority**: Mempool-first is the core UX differentiator — trades must appear instantly, not after block confirmation.
**Independent Test**: Submit a trade via POST, then verify it appears in trade history, updates OHLCV, and adjusts token reserves/stats.
**Acceptance Scenarios**:
1. **Given** valid trade data, **When** POST `/api/v1/trades`, **Then** 200 with `{ ok: true, txHash }`
2. **Given** trade submitted, **When** GET `/api/v1/tokens/:address/trades`, **Then** trade appears with status="pending"
3. **Given** buy trade submitted, **When** check token reserves, **Then** virtualBtc increased, virtualToken decreased, price updated
4. **Given** sell trade submitted, **When** check token reserves, **Then** virtualBtc decreased, virtualToken increased, price updated
5. **Given** trade submitted, **When** check OHLCV candles, **Then** new candle data reflects the trade price and volume
6. **Given** trade submitted, **When** check token stats, **Then** tradeCount and volume24h updated
7. **Given** buy trade submitted, **When** check holders, **Then** buyer appears in holder list with correct balance
8. **Given** missing required fields (txHash, tokenAddress, type, traderAddress), **When** POST, **Then** 400

---

### User Story 5 — Trade History & OHLCV (Priority: P1)
As a developer, I want to verify trade history pagination and candlestick data retrieval so that charts and trade tables render correctly.
**Why this priority**: Trade data feeds the chart and trade history — both are primary UI surfaces.
**Independent Test**: Seed trades at known timestamps, query with pagination and timeframe params, verify ordering and candle accuracy.
**Acceptance Scenarios**:
1. **Given** multiple trades exist for a token, **When** GET `/api/v1/tokens/:address/trades?page=1&limit=10`, **Then** correct page of trades in reverse chronological order
2. **Given** limit > 100, **When** query trades, **Then** limit capped at 100
3. **Given** trades at known times, **When** GET `/api/v1/tokens/:address/ohlcv?timeframe=1m`, **Then** candles reflect correct OHLC values and volume
4. **Given** valid timeframes (1m, 5m, 15m, 1h, 4h, 1d), **When** query OHLCV, **Then** each timeframe returns correctly bucketed data
5. **Given** invalid timeframe, **When** query OHLCV, **Then** 400 error
6. **Given** limit > 500, **When** query OHLCV, **Then** limit capped at 500
7. **Given** no trades for a token, **When** query OHLCV, **Then** empty candles array

---

### User Story 6 — Holders List (Priority: P2)
As a developer, I want to verify that the holder distribution endpoint returns accurate balances and percentages so that the holder table is trustworthy.
**Why this priority**: Holder data informs trading decisions but is not on the critical buy/sell path.
**Independent Test**: Seed multiple trades for different wallets, query holders, verify balances and percentages.
**Acceptance Scenarios**:
1. **Given** token with multiple holders, **When** GET `/api/v1/tokens/:address/holders`, **Then** holders sorted by balance descending with correct percent
2. **Given** limit=5, **When** query holders, **Then** only top 5 returned
3. **Given** limit > 50, **When** query, **Then** capped at 50
4. **Given** token with no trades, **When** query holders, **Then** empty holders array, holderCount=0
5. **Given** creator allocation > 0, **When** query holders after creation, **Then** creator appears with allocation balance

---

### User Story 7 — Profile / Creator Tokens (Priority: P2)
As a developer, I want to verify the profile endpoint returns all tokens created by a wallet so that user profiles display correctly.
**Why this priority**: Profile is a secondary UI surface — important but not transaction-critical.
**Independent Test**: Create multiple tokens for one wallet, query profile, verify completeness.
**Acceptance Scenarios**:
1. **Given** wallet created 3 tokens, **When** GET `/api/v1/profile/:address/tokens`, **Then** all 3 tokens returned with total=3
2. **Given** wallet created 0 tokens, **When** query profile, **Then** empty tokens array, total=0

---

### User Story 8 — Image Upload & Serve (Priority: P2)
As a developer, I want to verify token images can be uploaded, stored, and served so that token branding works end-to-end.
**Why this priority**: Images are required for token creation UX but are a supporting feature.
**Independent Test**: Upload an image, retrieve it by key, verify content matches.
**Acceptance Scenarios**:
1. **Given** valid base64 PNG under 500KB, **When** POST `/api/images`, **Then** 200 with URL containing key
2. **Given** image uploaded, **When** GET `/api/images/:key`, **Then** correct image binary with correct Content-Type and cache headers
3. **Given** invalid content type (e.g., application/pdf), **When** upload, **Then** 400
4. **Given** base64 data > 500KB, **When** upload, **Then** 400
5. **Given** missing data or contentType, **When** upload, **Then** 400
6. **Given** non-existent image key, **When** GET `/api/images/:key`, **Then** 404
7. **Given** >10 uploads from same IP in 60s, **When** upload again, **Then** 429 rate limited

---

### User Story 9 — Referral System (Priority: P2)
As a developer, I want to verify the referral code lifecycle (create, link, earn, query) so that the referral program functions correctly.
**Why this priority**: Referral is a growth feature — important for adoption but not core trading functionality.
**Independent Test**: Create a code, link a second wallet, submit a trade from the referred wallet, verify earnings credited.
**Acceptance Scenarios**:
1. **Given** wallet has no code, **When** GET `/api/v1/referral/:address`, **Then** code is null
2. **Given** valid code exists, **When** POST `/api/v1/referral/link` with walletAddress + referralCode, **Then** ok=true, referrerAddress returned
3. **Given** invalid code, **When** link, **Then** 404
4. **Given** self-referral (code owner = wallet), **When** link, **Then** 400
5. **Given** wallet already linked, **When** link again with different code, **Then** first-touch preserved, new link rejected
6. **Given** referred wallet trades, **When** GET referrer's earnings, **Then** totalSats and tradeCount incremented
7. **Given** admin secret, **When** POST `/api/v1/referral/bulk` with wallets, **Then** codes created for wallets without existing codes, skipped for those with codes
8. **Given** wrong admin secret, **When** bulk create, **Then** 401

---

### User Story 10 — Indexer (Priority: P2)
As a developer, I want to verify that the indexer correctly processes blocks, confirms pending trades, deduplicates orphans, and syncs reserves so that on-chain state stays consistent with Redis.
**Why this priority**: The indexer is a background process — critical for data integrity but not directly user-facing.
**Independent Test**: Seed pending trades, mock block data with matching events, run indexer, verify trades confirmed and orphans removed.
**Acceptance Scenarios**:
1. **Given** new blocks available, **When** indexer runs, **Then** blocks processed, lastBlockIndexed updated
2. **Given** block contains Buy event, **When** indexer processes, **Then** confirmed trade created with correct amounts/fees
3. **Given** pending trade exists and block confirms it (same txHash), **When** indexer processes, **Then** trade status updated to confirmed, createdAt preserved
4. **Given** pending trade exists but confirmed txHash differs (orphan), **When** indexer processes, **Then** orphan removed, new confirmed trade created
5. **Given** block contains Graduation event, **When** indexer processes, **Then** token moved from active to graduated indexes
6. **Given** indexer lock held by another process, **When** indexer runs, **Then** skipped gracefully (no crash)
7. **Given** gap > 500 blocks since last indexed, **When** indexer runs, **Then** auto-catch-up skips to recent blocks
8. **Given** HTTP trigger (POST `/api/v1/indexer/run`), **When** called with valid auth, **Then** indexer runs up to 50 blocks
9. **Given** HTTP trigger without auth when INDEXER_API_KEY is set, **When** called, **Then** 401

---

### User Story 11 — Platform Stats (Priority: P3)
As a developer, I want to verify the stats endpoint returns accurate aggregate data so that the platform dashboard is trustworthy.
**Why this priority**: Stats are informational — nice to have but not transactional.
**Independent Test**: Seed tokens and trades, query stats, verify counts match.
**Acceptance Scenarios**:
1. **Given** platform has tokens and trades, **When** GET `/api/stats`, **Then** totalTokens, totalGraduated, totalVolumeSats, totalTrades, lastBlockIndexed are correct
2. **Given** empty platform, **When** GET `/api/stats`, **Then** all values are 0 or sensible defaults

---

### User Story 12 — Rate Limiting (Priority: P2)
As a developer, I want to verify rate limiting prevents abuse across all protected endpoints so that the platform is resilient to spam.
**Why this priority**: Rate limiting protects platform integrity but is cross-cutting, not a standalone feature.
**Independent Test**: Send requests exceeding configured limits, verify 429 responses after threshold.
**Acceptance Scenarios**:
1. **Given** IP sends >100 requests in 60s to a rate-limited endpoint, **When** next request arrives, **Then** 429
2. **Given** wallet creates 3 tokens in 1 hour, **When** 4th creation attempted, **Then** rate limit error
3. **Given** IP uploads >10 images in 60s, **When** next upload, **Then** 429
4. **Given** rate limit window expires, **When** new request, **Then** request succeeds

---

### User Story 13 — CORS & Error Handling (Priority: P3)
As a developer, I want to verify that all endpoints return correct CORS headers and consistent error formats so that the frontend can handle all responses uniformly.
**Why this priority**: Cross-cutting concern — important for frontend integration but low risk of isolated failure.
**Independent Test**: Send requests with various Origin headers and invalid payloads, verify CORS headers and error shape.
**Acceptance Scenarios**:
1. **Given** any endpoint, **When** OPTIONS request, **Then** CORS headers present (Access-Control-Allow-Origin, etc.)
2. **Given** any endpoint returns an error, **Then** response body matches `{ error, message, statusCode }` shape
3. **Given** unsupported HTTP method, **When** request sent, **Then** 405 or appropriate error

---

### Edge Cases
- What happens when Redis connection drops mid-request?
- What happens when the OPNet RPC is unreachable during on-chain verification?
- What happens when two concurrent indexer invocations race for the lock?
- What happens when a token's contractAddress is valid bech32m vs. 0x hex — do all endpoints handle both?
- What happens when trade submission references a non-existent token?
- What happens when OHLCV candles span a timeframe boundary (e.g., trade at 11:59 and 12:01 for 1h candles)?
- What happens when the bonding curve simulation receives u256-range numbers?

## Requirements

### Functional Requirements
- **FR-001**: System MUST provide unit tests for all shared utility modules (bonding curve, rate limiting, response helpers, Redis queries, OHLCV, event decoders, referral queries)
- **FR-002**: System MUST provide integration tests for all 21 API endpoint handlers
- **FR-003**: System MUST mock external dependencies (Redis, OPNet RPC, Netlify Blobs) to enable fast, deterministic test runs
- **FR-004**: System MUST verify correct HTTP status codes, response shapes, and CORS headers for every endpoint
- **FR-005**: System MUST validate error paths (missing params, invalid data, rate limits, not-found, unauthorized) for every endpoint
- **FR-006**: System MUST test the mempool-first trade flow end-to-end: submit → optimistic update → indexer confirm → final state
- **FR-007**: System MUST test bonding curve math against known input/output pairs to catch rounding or overflow issues
- **FR-008**: System MUST test the indexer's deduplication logic (orphan removal when confirmed txHash differs from pending txHash)
- **FR-009**: System MUST test rate limiting behavior (under limit, at limit, over limit, after window expiry)
- **FR-010**: System MUST be runnable via a single command (e.g., `npm test`) from the `netlify/` directory
- **FR-011**: System MUST produce clear pass/fail output with descriptive test names
- **FR-012**: System MUST test referral code creation, linking (first-touch), earnings credit, and bulk admin operations
- **FR-013**: System MUST test image upload validation (size, type) and serve (correct content-type, cache headers)

### Key Entities (if data involved)
- **TokenDocument**: The canonical token record — name, symbol, address, reserves, config, status, stats
- **TradeDocument**: A single trade — txHash, type, amounts, fees, status (pending/confirmed), timestamps
- **OHLCV Candle**: Aggregated price data — open, high, low, close, volume for a time bucket
- **ReferralCode**: A 6-char alphanumeric code linking a referrer wallet to referred wallets
- **ReferralEarnings**: Running totals — totalSats, tradeCount, referralCount per referrer

## Success Criteria

### Measurable Outcomes
- **SC-001**: 100% of API endpoints have at least one happy-path and one error-path test
- **SC-002**: All shared utility modules have unit tests covering core logic and edge cases
- **SC-003**: All tests pass deterministically with no flakiness (no real network/Redis dependency)
- **SC-004**: Bonding curve simulation tests verify math accuracy to within 1 sat of expected values
- **SC-005**: Test suite completes in under 30 seconds
- **SC-006**: Mempool-first flow tested end-to-end: trade submit → state visible → indexer confirm → state consistent
- **SC-007**: Rate limiting tests verify enforcement at boundary conditions (exactly at limit, one over)

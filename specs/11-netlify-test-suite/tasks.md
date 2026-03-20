# Task List: Netlify Functions Test Suite

**Branch**: `11-netlify-test-suite`
**Generated**: 2026-03-19
**Total Tasks**: 42
**Phases**: 7

---

## Phase 1: Setup
**Goal**: Install Vitest, create config, establish directory structure.
**Dependencies**: None

- [x] T001 Add vitest devDependency and test/test:watch scripts to `netlify/package.json`
- [x] T002 Create Vitest config at `netlify/vitest.config.mts` — include `__tests__/**/*.test.mts`, setupFiles `__tests__/setup.ts`, testTimeout 10000, globals false
- [x] T003 Create global test setup at `netlify/__tests__/setup.ts` — set env vars (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, FRONTEND_URL, OPNET_RPC_URL, NETWORK, ADMIN_SECRET), import and register all mocks
- [x] T004 Run `cd netlify && npm install` to install vitest

---

## Phase 2: Foundational — Mocks & Fixtures
**Goal**: Build the three mock boundaries and test fixtures. All subsequent tests depend on these.
**Dependencies**: Phase 1

- [x] T005 Create in-memory Redis mock at `netlify/__tests__/mocks/redis-mock.ts` — implement hash ops (hset, hget, hgetall, hdel, hincrby), string ops (set with NX/EX, get, incr, expire, del), sorted set ops (zadd, zrange with BYSCORE/BYLEX/REV, zrangebyscore, zrevrangebyscore, zrevrange, zrem, zcard, zscore), set ops (sadd, smembers, scard, sismember), pipeline(), eval() for OHLCV Lua script, ping(), keys(). Export `mockRedis` instance and `resetMockRedis()` function. Register via `vi.mock()` on the `_shared/redis.mts` module so `getRedis()` returns the mock.
- [x] T006 [P] Create OPNet RPC mock at `netlify/__tests__/mocks/opnet-mock.ts` — mock `opnet` module (JSONRpcProvider with getTransaction, getBlockNumber, getContract returning stubs for getReserves/getConfig, ABIDataTypes, BitcoinAbiTypes constants) and `@btc-vision/bitcoin` module (networks.opnetTestnet). Export helpers to configure mock return values per test.
- [x] T007 [P] Create Netlify Blobs mock at `netlify/__tests__/mocks/blobs-mock.ts` — mock `@netlify/blobs` module's `getStore()` returning in-memory store with set(key, data, opts), get(key), getWithMetadata(key). Export `resetBlobStore()`.
- [x] T008 Create test fixtures at `netlify/__tests__/fixtures/index.ts` — factory functions: `makeToken(overrides?)` → TokenDocument, `makeTrade(overrides?)` → TradeDocument, `makeCreateTokenRequest(overrides?)` → CreateTokenRequest. Export constants: VALID_TOKEN_ADDRESS, VALID_CREATOR_ADDRESS, VALID_TRADER_ADDRESS, VALID_TX_HASH. All values use realistic formats (bech32m addresses, 64-char hex hashes, initial bonding curve reserves).
- [x] T009 Verify test infrastructure works: create a minimal smoke test at `netlify/__tests__/unit/smoke.test.mts` that imports the Redis mock, calls `ping()`, asserts "PONG". Run `cd netlify && npm test` to confirm Vitest discovers and passes it. Delete the smoke test after verification.

---

## Phase 3: Unit Tests — Shared Modules
**Goal**: Test all shared utility modules that the API handlers depend on. These are prerequisites for integration tests.
**Dependencies**: Phase 2
**Parallel note**: T010-T018 can all run in parallel (different files, no cross-dependencies).

- [x] T010 [P] Create `netlify/__tests__/unit/bonding-curve.test.mts` — test BondingCurveSimulator: simulateBuy with initial reserves (verify tokensOut, fees breakdown, newReserves, priceImpactBps, newPriceSats, effectivePriceSats against hand-computed values from research.md), simulateBuy below MIN_TRADE_SATS throws, simulateBuy exceeding GRADUATION_THRESHOLD_SATS throws, simulateSell with post-buy reserves (verify btcOut, fees), simulateSell exceeding realBtcReserve throws, simulateSell below minimum output throws, calculatePrice with known values, getInitialReserves matches constants, fee calculation with flywheel tax (buyTaxBps > 0), roundtrip buy→sell same BTC amount (verify reserves close to start within bigint rounding)
- [x] T011 [P] Create `netlify/__tests__/unit/response.test.mts` — test corsHeaders() returns all 4 Access-Control headers with FRONTEND_URL value, json(data) returns Response with status 200 + JSON Content-Type + CORS headers + correct body, json(data, 201) returns custom status, error(msg, 400) returns `{ error: "BadRequest", message, statusCode: 400 }` shape, error with custom errorCode
- [x] T012 [P] Create `netlify/__tests__/unit/rate-limit.test.mts` — test checkRateLimit allows first N requests and rejects N+1, checkIpRateLimit uses key format `op:rl:{prefix}:{ip}` with defaults 100/60s, checkCreateRateLimit uses key format `op:rl:create:{wallet}` with limit 3/3600s, verify redis.expire is called to set TTL
- [x] T013 [P] Create `netlify/__tests__/unit/event-decoders.test.mts` — test readU256FromEventData with known 32-byte big-endian input → correct bigint, readAddressFromEventData → correct 0x hex string, decodeBuyEvent with constructed event data → {buyer, btcIn, tokensOut, newPrice}, decodeSellEvent → {seller, tokensIn, btcOut, newPrice}, hexAddressToBech32m → valid bech32m address on opnetTestnet
- [x] T014 [P] Create `netlify/__tests__/unit/redis-queries.test.mts` — Token ops: saveToken stores hash + all indexes (active/all sorted sets, creator set, search set), getToken retrieves and unflattens (JSON fields parsed, dates restored), getToken non-existent → null, listTokens pagination (page/limit/total/totalPages correct), listTokens with status filter, listTokens with search, listTokens with sort (newest/volume24h/marketCap/price), getTokensByCreator, updateToken partial update preserves other fields + refreshes sort indexes, graduateToken moves from active→graduated indexes. Trade ops: saveTrade stores hash + token/trader indexes, saveTrade preserves original createdAt on re-save (mempool-first rule), listTradesForToken paginated reverse-chronological, findAndRemoveOrphanedPendingTrade, updateHolderBalance buy increases / sell decreases, getTopHolders sorted by balance desc, getHolderCount. Stats: getStats/updateStats roundtrip, get/setLastBlockIndexed, acquireIndexerLock succeeds then fails, releaseIndexerLock re-enables acquire.
- [x] T015 [P] Create `netlify/__tests__/unit/redis-ohlcv.test.mts` — test updateOHLCV creates new candles across all 6 timeframes when none exist (verify O=H=L=C=price, V=volume), updateOHLCV updates existing candle (H=max, L=min, C=last price, V+=volume), getOHLCV returns candles in chronological order, getOHLCV respects limit, verify timeframe bucketing produces correct bucket timestamps for 1m/5m/15m/1h/4h/1d
- [x] T016 [P] Create `netlify/__tests__/unit/referral-queries.test.mts` — test createReferralCode stores code→wallet in hash + wallet→code string, getReferralCode returns code, getCodeInfo returns owner wallet, linkWalletToReferrer first-touch succeeds (SET NX), linkWalletToReferrer second attempt returns false, getReferrer returns referrer wallet, creditReferralEarnings increments totalSats and tradeCount via HINCRBY, getReferralEarnings returns accumulated values, generateCode returns 6-char string from alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789
- [x] T017 [P] Create `netlify/__tests__/unit/create-token.test.mts` — test handleCreateToken (from _shared/create-token.mts): valid request → 201 with full TokenDocument including initial reserves, missing name/symbol/contractAddress/creatorAddress/deployTxHash → 400, name>50/symbol>10/description>500 → 400, invalid address format → 400, duplicate contractAddress → 409, on-chain verification failure → 400 (mock verifyTokenOnChain to return {valid:false}), rate limited 4th creation → 429, creatorAllocationBps>0 → holder balance set in sorted set
- [x] T018 [P] Create `netlify/__tests__/unit/image-storage.test.mts` — test uploadImage: valid PNG base64 → returns {url} with generated key, invalid contentType (application/pdf) → throws, data exceeding 500KB → throws, all 5 allowed types accepted (png/jpeg/gif/webp/svg+xml), stored blob matches decoded input bytes

---

## Phase 4: P1 Integration Tests — Core Trading Flow
**Goal**: Test the critical path endpoints: health, tokens, simulations, trades, OHLCV.
**Dependencies**: Phase 3
**Parallel note**: T019-T023 can run in parallel (independent endpoint groups).

- [x] T019 [P] [US1] Create `netlify/__tests__/integration/health.test.mts` — import health.mts and health-debug.mts handlers. Tests: GET → 200 `{status:"ok", timestamp}`, Redis error (mock ping to throw) → 503, OPTIONS → 204 with CORS headers, health-debug GET → 200 with {status, checks: {env, redis, data, sampleToken}} structure, health-debug with empty Redis → data checks reflect empty state without crash
- [x] T020 [P] [US2] Create `netlify/__tests__/integration/tokens.test.mts` — import tokens-create, tokens-list, tokens-detail, tokens-price handlers. Tests: POST valid body (mock on-chain verify success) → 201 with TokenDocument, POST missing fields → 400, POST invalid JSON → 400, POST duplicate address → 409, GET list with seeded tokens → 200 with {tokens, pagination}, GET list ?search=TEST → filtered, GET list ?status=active → only active, GET list ?sort=volume24h&order=desc → sorted, GET /:address existing → 200 full document, GET /:address non-existent → 404, GET /:address/price → 200 {currentPriceSats, virtualBtcReserve, virtualTokenSupply, realBtcReserve, change24hBps}, OPTIONS on each → 204
- [x] T021 [P] [US3] Create `netlify/__tests__/integration/simulate.test.mts` — import simulate-buy, simulate-sell handlers. Seed a token in mock Redis. Tests: POST buy valid → 200 {tokensOut, fees:{platform,creator,flywheel,total}, priceImpactBps, newPriceSats, effectivePriceSats}, POST buy non-existent token → 404, POST buy graduated token → 400, POST buy below MIN_TRADE_SATS → 400, POST buy exceeding graduation → 400 SimulationError, POST buy missing fields → 400, POST buy invalid btcAmountSats (non-numeric) → 400, GET (wrong method) → 405, POST sell valid → 200 {btcOut, fees, ...}, POST sell insufficient reserve → 400
- [x] T022 [P] [US4] Create `netlify/__tests__/integration/trades.test.mts` — import trades-submit, tokens-trades handlers. Seed a token. Tests: POST /trades valid buy → 200 {ok:true, txHash}, POST missing fields → 400, after submit: GET /trades → trade with status="pending", after buy submit: token virtualBtcReserve increased + virtualTokenSupply decreased + currentPriceSats updated, after submit: OHLCV candle exists for trade price/volume (call getOHLCV directly), after submit: token tradeCount + volume24h incremented, after buy: holder appears in holders sorted set, after sell: holder balance decreased, GET /trades pagination works, GET /trades limit>100 capped, OPTIONS → 204
- [x] T023 [P] [US5] Create `netlify/__tests__/integration/ohlcv.test.mts` — import tokens-ohlcv handler. Seed OHLCV candles via updateOHLCV. Tests: GET default → 200 {candles, timeframe, tokenAddress}, GET ?timeframe=1h → correct bucket, GET ?timeframe=invalid → 400, GET ?limit=600 → capped at 500, GET non-existent token → empty candles array, verify candle shape {time, open, high, low, close, volume}

---

## Phase 5: P2 Integration Tests — Secondary Features
**Goal**: Test holders, profile, images, referrals, indexer, rate limiting.
**Dependencies**: Phase 3
**Parallel note**: T024-T030 can run in parallel.

- [x] T024 [P] [US6] Create `netlify/__tests__/integration/holders.test.mts` — import holders-list handler. Seed token + holder balances in mock Redis. Tests: GET → 200 {holders:[{address, balance, percent}], holderCount, circulatingSupply} sorted by balance desc, GET ?limit=5 → only 5, GET ?limit=60 → capped at 50, GET no holders → empty array + holderCount=0
- [x] T025 [P] [US7] Create `netlify/__tests__/integration/profile.test.mts` — import profile-tokens handler. Seed 3 tokens for one creator. Tests: GET /:address/tokens → 200 {address, tokens:[...3], total:3}, GET /:address with 0 tokens → empty array + total=0
- [x] T026 [P] [US8] Create `netlify/__tests__/integration/images.test.mts` — import upload-image, serve-image handlers. Tests: POST valid PNG base64 → 200 {url}, POST invalid type → 400, POST >500KB → 400, POST missing data/contentType → 400, GET /:key after upload → correct binary with Content-Type and Cache-Control headers, GET /:key non-existent → 404, rate limit: submit 11 uploads from same IP → 429 on 11th
- [x] T027 [P] [US9] Create `netlify/__tests__/integration/referral.test.mts` — import referral-link, referral-info, referral-bulk handlers. Seed referral code in mock Redis. Tests: POST /link valid code + wallet → 200 {ok, referrerAddress}, POST /link invalid code → 404, POST /link self-referral → 400, POST /link already-linked wallet → first-touch preserved (original referrer returned), GET /referral/:address with code → {code, earnings, referredBy}, GET /referral/:address no data → code=null, POST /bulk with correct ADMIN_SECRET → 200 {created, skipped, codes}, POST /bulk wrong secret → 401
- [x] T028 [P] [US10] Create `netlify/__tests__/integration/indexer.test.mts` — import indexer-run handler and runIndexer from indexer-core. Mock OPNet RPC to return configurable blocks with events. Tests: runIndexer with 2 new blocks → {blocksProcessed:2, lastBlock updated}, runIndexer with Buy event → confirmed trade in Redis with correct amounts/fees, runIndexer confirms pending trade → status=confirmed + createdAt preserved, runIndexer orphan (pending hash≠confirmed hash) → orphan removed + new confirmed trade, runIndexer Graduation event → token graduated in indexes, runIndexer with lock held → returns {skipped:true}, runIndexer gap>500 → auto-catch-up, POST /indexer/run with valid Bearer token → 200 runs indexer, POST /indexer/run without auth (INDEXER_API_KEY set) → 401, GET /indexer/run → current state
- [x] T029 [P] [US12] Create rate limiting integration tests within existing test files — in tokens.test.mts: add test for 4th token creation → rate limit error. In images.test.mts: already covered by T026 (11th upload → 429). Verify rate-limit unit tests (T012) cover the core boundary logic.
- [x] T030 [P] [US13] Create CORS/error format assertions as shared helpers in `netlify/__tests__/fixtures/index.ts` — add `expectCorsHeaders(res: Response)` and `expectErrorShape(res: Response, statusCode: number)` helpers. Add a CORS/error test to at least 3 integration files (health, tokens, simulate) verifying OPTIONS → 204, error responses match `{error, message, statusCode}` shape, unsupported method → 405.

---

## Phase 6: P3 Integration Tests + End-to-End
**Goal**: Test stats endpoint, and the critical mempool-first lifecycle.
**Dependencies**: Phase 4, Phase 5

- [x] T031 [P] [US11] Create `netlify/__tests__/integration/stats.test.mts` — import stats handler. Tests: GET with seeded stats → 200 {totalTokens, totalGraduated, totalVolumeSats, totalTrades, lastBlockIndexed}, GET empty platform → all zeros/defaults, OPTIONS → 204
- [x] T032 Create `netlify/__tests__/integration/mempool-flow.test.mts` — End-to-end mempool-first lifecycle test: (1) Seed token via saveToken with initial reserves, (2) Submit buy trade via trades-submit handler, (3) Verify trade in tokens-trades response with status=pending, (4) Verify token price updated via tokens-price handler, (5) Verify OHLCV candle created via tokens-ohlcv handler, (6) Verify buyer in holders-list handler, (7) Simulate indexer confirmation by calling saveTrade with status=confirmed + same txHash, (8) Verify trade createdAt preserved (not overwritten — mempool-first rule), (9) Verify all data consistent (price, reserves, holder count, trade count match)

---

## Phase 7: Polish & Verification
**Goal**: Ensure suite runs cleanly, meets performance target, and is ready for CI.
**Dependencies**: All previous phases

- [x] T033 Run full test suite via `cd netlify && npm test` — verify all tests pass with no failures or warnings
- [x] T034 Verify suite completes in under 30 seconds — if any test file exceeds 5s, investigate and optimize (likely mock issue or unnecessary async waits)
- [x] T035 Ensure `npm test` exits with code 0 on success and non-zero on failure — verify CI compatibility
- [x] T036 Clean up any TODO/skip markers left during development — all tests should be active
- [x] T037 Review test names for clarity — each `describe`/`it` block should read as a clear acceptance scenario matching the spec

---

## Dependency Graph

```
Phase 1 (Setup)
  └─→ Phase 2 (Mocks & Fixtures)
        └─→ Phase 3 (Unit Tests) ──┬──→ Phase 4 (P1 Integration)
                                   ├──→ Phase 5 (P2 Integration)
                                   │         │
                                   │         ▼
                                   └──→ Phase 6 (P3 + E2E)
                                              │
                                              ▼
                                        Phase 7 (Polish)
```

Phases 4 and 5 can run in parallel after Phase 3.
Within each phase, tasks marked [P] can run in parallel.

---

## Summary

| Phase | Tasks | Parallel? | Story Coverage |
|-------|-------|-----------|----------------|
| 1: Setup | T001–T004 | Sequential | — |
| 2: Foundational | T005–T009 | T006, T007 parallel | — |
| 3: Unit Tests | T010–T018 | All parallel | US1–US13 (shared modules) |
| 4: P1 Integration | T019–T023 | All parallel | US1, US2, US3, US4, US5 |
| 5: P2 Integration | T024–T030 | All parallel | US6, US7, US8, US9, US10, US12, US13 |
| 6: P3 + E2E | T031–T032 | T031 parallel | US11, Mempool-first E2E |
| 7: Polish | T033–T037 | Sequential | — |

**Total**: 37 tasks (5 sequential phases after setup, heavy parallelism within phases)

**MVP scope**: Phase 1 + Phase 2 + T010 (bonding curve) + T019 (health) — validates the full pipeline: setup → mock → unit test → integration test.

**Next step**: Run `/implement` to begin execution.

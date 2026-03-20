# Implementation Plan: Netlify Functions Test Suite

**Branch**: `11-netlify-test-suite` | **Date**: 2026-03-19 | **Spec**: specs/11-netlify-test-suite/spec.md

## Summary

Build a comprehensive test suite for the 21 Netlify Functions API and 14 shared modules using Vitest with an in-memory Redis mock. Tests call function handlers directly (no HTTP server) and mock three external boundaries: Upstash Redis, OPNet RPC, and Netlify Blobs.

## Technical Context

| Key | Value |
|-----|-------|
| **Language/Version** | TypeScript (ES2022), Node 20+ |
| **Primary Dependencies** | Vitest (test runner), `@netlify/functions` types |
| **Storage** | In-memory mock Redis (Map-based) |
| **Testing** | Vitest with `vi.mock()` for module mocking |
| **Target Platform** | Netlify Functions (serverless) |
| **Project Type** | Single project — tests added to existing `netlify/` directory |
| **Performance Goal** | Full suite < 30 seconds |
| **Constraints** | No real network calls, no real Redis, deterministic |

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for u256 | N/A | Tests don't write contract code |
| Frontend never holds keys | N/A | Tests are server-side only |
| API responses follow shared types | **TESTED** | Validates response shapes match expected structures |
| Mempool-first | **TESTED** | Dedicated test flow: submit → visible → confirm → consistent |

## Project Structure

```
netlify/
├── __tests__/
│   ├── setup.ts                      # Global test setup (env vars, mock reset)
│   ├── mocks/
│   │   ├── redis-mock.ts             # In-memory Redis implementation
│   │   ├── opnet-mock.ts             # OPNet RPC provider + contract mock
│   │   └── blobs-mock.ts             # Netlify Blobs in-memory mock
│   ├── fixtures/
│   │   └── index.ts                  # Token, trade, referral test fixtures
│   ├── unit/
│   │   ├── bonding-curve.test.mts    # Pure math: buy/sell simulations
│   │   ├── event-decoders.test.mts   # Event data parsing
│   │   ├── rate-limit.test.mts       # Rate limiting logic
│   │   ├── response.test.mts         # CORS headers, JSON/error formatting
│   │   ├── redis-queries.test.mts    # Token/trade CRUD, indexes, holders
│   │   ├── redis-ohlcv.test.mts      # Candle update/fetch logic
│   │   ├── referral-queries.test.mts # Referral code CRUD, linking, earnings
│   │   ├── create-token.test.mts     # Token creation validation logic
│   │   └── image-storage.test.mts    # Image upload validation
│   └── integration/
│       ├── health.test.mts           # health + health-debug endpoints
│       ├── tokens.test.mts           # tokens-create, tokens-list, tokens-detail, tokens-price
│       ├── simulate.test.mts         # simulate-buy, simulate-sell
│       ├── trades.test.mts           # trades-submit, tokens-trades
│       ├── ohlcv.test.mts            # tokens-ohlcv
│       ├── holders.test.mts          # holders-list
│       ├── profile.test.mts          # profile-tokens
│       ├── images.test.mts           # upload-image, serve-image
│       ├── referral.test.mts         # referral-link, referral-info, referral-bulk
│       ├── indexer.test.mts          # indexer, indexer-run
│       ├── stats.test.mts            # stats endpoint
│       └── mempool-flow.test.mts     # End-to-end mempool-first flow
├── vitest.config.mts                 # Vitest config
├── functions/                        # (existing — no changes)
└── package.json                      # (add vitest dev dependency + test script)
```

---

## Phase 1: Test Infrastructure

### 1.1 — Install Vitest & Configure

**File**: `netlify/package.json` (modify)

Add dev dependencies:
```json
{
  "devDependencies": {
    "vitest": "^3.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**File**: `netlify/vitest.config.mts` (new)

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.mts'],
    setupFiles: ['__tests__/setup.ts'],
    testTimeout: 10_000,
    globals: false,
  },
});
```

### 1.2 — Global Test Setup

**File**: `netlify/__tests__/setup.ts` (new)

Set required env vars so `getRedis()`, `corsHeaders()`, and `verifyTokenOnChain()` don't crash:
```
UPSTASH_REDIS_REST_URL=http://fake-redis
UPSTASH_REDIS_REST_TOKEN=fake-token
FRONTEND_URL=http://localhost:5173
OPNET_RPC_URL=http://fake-rpc
NETWORK=testnet
```

Reset mock state (clear in-memory Redis) via `beforeEach` hooks.

### 1.3 — In-Memory Redis Mock

**File**: `netlify/__tests__/mocks/redis-mock.ts` (new)

A stateful in-memory implementation of the Upstash Redis API surface used by the codebase:

**Hash operations**: `hset`, `hget`, `hgetall`, `hdel`, `hincrby`
**String operations**: `set` (with NX/EX options), `get`, `incr`, `expire`, `del`
**Sorted set operations**: `zadd`, `zrange` (with BYSCORE/BYLEX/REV options), `zrangebyscore`, `zrevrangebyscore`, `zrem`, `zcard`, `zscore`, `zrevrange`
**Set operations**: `sadd`, `smembers`, `scard`, `sismember`
**Pipeline**: Chainable `.pipeline()` that queues commands and executes in `exec()`
**Lua eval**: Simplified `eval()` that handles the OHLCV update script pattern
**Utility**: `ping()` → "PONG", `keys()` for debugging

Mock is registered via `vi.mock('./_shared/redis.mts')` to replace `getRedis()`.

### 1.4 — OPNet RPC Mock

**File**: `netlify/__tests__/mocks/opnet-mock.ts` (new)

Mocks:
- `JSONRpcProvider`: constructor accepts config, `getTransaction()` returns configurable mock tx
- `getContract()`: returns object with `getReserves()` and `getConfig()` stubs
- `ABIDataTypes`, `BitcoinAbiTypes`: constant enums
- `networks.opnetTestnet`: network config object

Registered via `vi.mock('opnet')` and `vi.mock('@btc-vision/bitcoin')`.

### 1.5 — Netlify Blobs Mock

**File**: `netlify/__tests__/mocks/blobs-mock.ts` (new)

Mocks:
- `getStore(name)`: returns in-memory store with `set(key, data, opts)`, `get(key)`, `getWithMetadata(key)`
- Storage: `Map<string, { data: ArrayBuffer, metadata: Record<string, string> }>`

Registered via `vi.mock('@netlify/blobs')`.

### 1.6 — Test Fixtures

**File**: `netlify/__tests__/fixtures/index.ts` (new)

Factory functions:
- `makeToken(overrides?)`: Returns a complete `TokenDocument` with sensible defaults (initial reserves, active status)
- `makeTrade(overrides?)`: Returns a complete `TradeDocument` (pending buy)
- `makeCreateTokenRequest(overrides?)`: Returns valid `CreateTokenRequest`
- `VALID_TOKEN_ADDRESS`, `VALID_CREATOR_ADDRESS`, `VALID_TX_HASH`: Reusable test constants

---

## Phase 2: Unit Tests

### 2.1 — Bonding Curve Simulator (`bonding-curve.test.mts`)

Tests the `BondingCurveSimulator` class directly (pure math, no mocks needed):

- `simulateBuy` with initial reserves → verify tokensOut, fees, newReserves, priceImpact
- `simulateBuy` below minimum → throws "Below minimum trade amount"
- `simulateBuy` exceeding graduation threshold → throws
- `simulateSell` with post-buy reserves → verify btcOut, fees
- `simulateSell` exceeding real BTC reserve → throws
- `simulateSell` below minimum output → throws
- `calculatePrice` with known values → exact result
- `getInitialReserves` → matches constants
- Fee calculation: verify platform/creator/flywheel split
- Roundtrip: buy then sell same amount → end reserves close to start (within rounding)
- Large amounts: bigint overflow safety

### 2.2 — Response Helpers (`response.test.mts`)

- `corsHeaders()` returns correct Access-Control headers
- `json(data)` returns 200 with JSON body and CORS
- `json(data, 201)` returns custom status
- `error(msg, 400)` returns `{ error, message, statusCode }` shape

### 2.3 — Rate Limiting (`rate-limit.test.mts`)

Uses Redis mock:
- `checkRateLimit` allows first N requests
- `checkRateLimit` rejects request N+1
- `checkIpRateLimit` uses correct key format
- `checkCreateRateLimit` enforces 3-per-hour

### 2.4 — Event Decoders (`event-decoders.test.mts`)

- `decodeBuyEvent` extracts buyer, btcIn, tokensOut, newPrice from known byte data
- `decodeSellEvent` extracts seller, tokensIn, btcOut, newPrice
- `readU256FromEventData` with known bytes → correct bigint
- `readAddressFromEventData` → correct hex string
- `hexAddressToBech32m` → valid bech32m address

### 2.5 — Redis Queries (`redis-queries.test.mts`)

Uses Redis mock — tests the query layer's interaction with Redis:

**Token operations**:
- `saveToken` stores all fields in hash + updates all indexes
- `getToken` retrieves and unflattens correctly
- `getToken` for non-existent → null
- `listTokens` pagination (page, limit, total, totalPages)
- `listTokens` with status filter
- `listTokens` with search filter
- `listTokens` with sort (newest, volume24h, marketCap, price)
- `getTokensByCreator` returns only that creator's tokens
- `updateToken` partial update preserves other fields
- `graduateToken` moves from active to graduated indexes

**Trade operations**:
- `saveTrade` stores fields + updates indexes
- `saveTrade` preserves original `createdAt` on update (mempool-first rule)
- `listTradesForToken` returns paginated, reverse-chronological
- `findAndRemoveOrphanedPendingTrade` finds and removes matching orphan
- `updateHolderBalance` on buy → increases balance
- `updateHolderBalance` on sell → decreases balance
- `getTopHolders` returns sorted by balance
- `getHolderCount` returns correct count

**Stats & indexer state**:
- `getStats` / `updateStats` roundtrip
- `getLastBlockIndexed` / `setLastBlockIndexed` roundtrip
- `acquireIndexerLock` succeeds first time, fails second time
- `releaseIndexerLock` allows re-acquisition

### 2.6 — Redis OHLCV (`redis-ohlcv.test.mts`)

Uses Redis mock:
- `updateOHLCV` creates new candle (all timeframes) when none exists
- `updateOHLCV` updates existing candle: H=max, L=min, C=last, V+=new
- `getOHLCV` returns candles in chronological order
- `getOHLCV` respects limit parameter
- Timeframe bucketing: 1m, 5m, 15m, 1h, 4h, 1d produce correct bucket keys

### 2.7 — Referral Queries (`referral-queries.test.mts`)

Uses Redis mock:
- `createReferralCode` stores code → wallet mapping
- `getReferralCode` returns wallet's code
- `getCodeInfo` returns code's owner wallet
- `linkWalletToReferrer` first-touch succeeds
- `linkWalletToReferrer` second attempt rejected (NX semantics)
- `getReferrer` returns linked referrer
- `creditReferralEarnings` increments totalSats and tradeCount
- `getReferralEarnings` returns accumulated earnings
- `generateCode` returns 6-char string from valid alphabet

### 2.8 — Create Token Validation (`create-token.test.mts`)

Uses Redis mock + OPNet mock:
- Valid request → 201 with full TokenDocument
- Missing name → 400
- Missing symbol → 400
- Missing contractAddress → 400
- Missing creatorAddress → 400
- Missing deployTxHash → 400
- Name > 50 chars → 400
- Symbol > 10 chars → 400
- Description > 500 chars → 400
- Invalid address format → 400
- Duplicate contractAddress → 409
- On-chain verification fails → 400
- Rate limited (4th in 1hr) → 429
- Creator allocation > 0 → holder balance set

### 2.9 — Image Storage (`image-storage.test.mts`)

Uses Blobs mock:
- Valid PNG upload → returns URL with key
- Invalid content type → throws
- Oversized image (>500KB) → throws
- Stored data matches input

---

## Phase 3: Integration Tests

Integration tests call the exported handler functions directly with `Request` objects and verify the full `Response` including status, headers, and body.

### 3.1 — Health Endpoints (`health.test.mts`)

- GET `/api/health` → 200 `{ status: "ok", timestamp }`
- GET `/api/health` with Redis error → 503
- OPTIONS → 204 with CORS headers
- GET `/api/health/debug` → 200 with all check sections

### 3.2 — Token Endpoints (`tokens.test.mts`)

- POST `/api/v1/tokens` with valid body → 201
- POST with missing fields → 400
- POST with invalid JSON → 400
- GET `/api/v1/tokens` → 200 with pagination
- GET `/api/v1/tokens?search=TEST` → filtered results
- GET `/api/v1/tokens?status=active` → only active
- GET `/api/v1/tokens?sort=volume24h&order=desc` → sorted
- GET `/api/v1/tokens/:address` → 200 with full document
- GET `/api/v1/tokens/:address` non-existent → 404
- GET `/api/v1/tokens/:address/price` → 200 with price data
- OPTIONS on all endpoints → 204 with CORS

### 3.3 — Simulation Endpoints (`simulate.test.mts`)

- POST `/api/v1/simulate/buy` → 200 with simulation result
- POST `/api/v1/simulate/buy` non-existent token → 404
- POST `/api/v1/simulate/buy` graduated token → 400
- POST `/api/v1/simulate/buy` below minimum → 400
- POST `/api/v1/simulate/buy` exceeds graduation → 400 (SimulationError)
- POST `/api/v1/simulate/buy` missing fields → 400
- POST `/api/v1/simulate/buy` invalid btcAmountSats → 400
- GET (wrong method) → 405
- POST `/api/v1/simulate/sell` → 200 with simulation result
- POST `/api/v1/simulate/sell` insufficient reserve → 400

### 3.4 — Trade Submission (`trades.test.mts`)

- POST `/api/v1/trades` valid buy → 200 `{ ok, txHash }`
- POST with missing fields → 400
- POST valid → trade visible in trade list (pending)
- POST valid → token reserves updated optimistically
- POST valid → OHLCV candle updated
- POST valid → token stats updated (tradeCount, volume)
- POST buy → holder balance updated
- POST sell → holder balance decreased
- GET `/api/v1/tokens/:address/trades` → paginated trades
- GET with limit > 100 → capped
- OPTIONS → 204

### 3.5 — OHLCV (`ohlcv.test.mts`)

- GET `/api/v1/tokens/:address/ohlcv` → 200 with candles
- GET with timeframe=1h → correct bucket size
- GET with invalid timeframe → 400
- GET with limit > 500 → capped
- GET non-existent token → empty candles

### 3.6 — Holders (`holders.test.mts`)

- GET `/api/v1/tokens/:address/holders` → 200 with sorted holders
- GET with limit=5 → only 5 returned
- GET with limit > 50 → capped at 50
- GET no holders → empty array, holderCount=0

### 3.7 — Profile (`profile.test.mts`)

- GET `/api/v1/profile/:address/tokens` → 200 with creator's tokens
- GET no tokens → empty array, total=0

### 3.8 — Image Endpoints (`images.test.mts`)

- POST `/api/images` valid PNG → 200 with URL
- POST invalid type → 400
- POST oversized → 400
- POST missing data → 400
- GET `/api/images/:key` existing → image binary with correct Content-Type
- GET `/api/images/:key` non-existent → 404
- Rate limiting: 11th upload in 60s → 429

### 3.9 — Referral Endpoints (`referral.test.mts`)

- POST `/api/v1/referral/link` valid → 200 `{ ok, referrerAddress }`
- POST invalid code → 404
- POST self-referral → 400
- POST already-linked wallet → first-touch preserved
- GET `/api/v1/referral/:address` → 200 with code, earnings, referredBy
- GET no referral data → code=null
- POST `/api/v1/referral/bulk` with valid secret → 200
- POST `/api/v1/referral/bulk` wrong secret → 401

### 3.10 — Indexer (`indexer.test.mts`)

- `runIndexer()` with new blocks → blocksProcessed > 0, lastBlock updated
- `runIndexer()` with Buy event → confirmed trade created
- `runIndexer()` confirms pending trade → status updated, createdAt preserved
- `runIndexer()` orphan detection → orphan removed
- `runIndexer()` Graduation event → token graduated
- `runIndexer()` lock held → skipped gracefully
- `runIndexer()` gap > 500 → auto-catch-up
- POST `/api/v1/indexer/run` with auth → runs indexer
- POST `/api/v1/indexer/run` without auth → 401
- GET `/api/v1/indexer/run` → current state

### 3.11 — Stats (`stats.test.mts`)

- GET `/api/stats` with data → correct aggregates
- GET `/api/stats` empty → zeros/defaults

### 3.12 — Mempool-First End-to-End (`mempool-flow.test.mts`)

Tests the full lifecycle in sequence:
1. Create a token (seed in Redis)
2. Submit a buy trade via `trades-submit` handler
3. Verify trade appears in `tokens-trades` with status=pending
4. Verify token price updated in `tokens-price`
5. Verify OHLCV candle created in `tokens-ohlcv`
6. Verify holder appears in `holders-list`
7. Simulate indexer confirmation (update trade status to confirmed)
8. Verify trade still has original `createdAt` (not overwritten)
9. Verify all data consistent after confirmation

---

## Phase 4: CI Integration

### 4.1 — npm test Script

Ensure `cd netlify && npm test` runs the full suite and exits with 0 on success, non-zero on failure.

### 4.2 — Verify < 30s Target

All tests run in-memory with no I/O, so this should be well under the target. If any test exceeds 5s, investigate and optimize.

---

## Complexity Tracking

| Item | Complexity | Risk | Mitigation |
|------|-----------|------|------------|
| Redis mock fidelity | Medium | Mock behavior diverges from Upstash | Test mock against known Redis semantics; keep scope to used commands only |
| OHLCV Lua script mock | Medium | Lua logic in JS may diverge | Verify against manual candle calculations |
| Indexer test (RPC mock) | High | Complex event processing chain | Break into small focused tests per event type |
| `.mts` extension + ESM | Low | Vitest has native support | Verify in config |
| Module singleton reset | Low | `getRedis()` caches Redis instance | Use `vi.mock()` to intercept at module level |

---

## Summary of Artifacts

| Artifact | Path |
|----------|------|
| Spec | `specs/11-netlify-test-suite/spec.md` |
| Research | `specs/11-netlify-test-suite/research.md` |
| Data Model | `specs/11-netlify-test-suite/data-model.md` |
| Plan | `specs/11-netlify-test-suite/plan.md` |

## Next Step

Run `/generate-tasks` to produce the ordered task list from this plan.

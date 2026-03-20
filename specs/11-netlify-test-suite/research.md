# Phase 0 — Research

**Branch**: `11-netlify-test-suite`
**Date**: 2026-03-19

## R-001: Test Framework Choice

**Decision**: Vitest

**Rationale**:
- The project already uses Vitest (`shared/__tests__/constants.test.ts` imports from `vitest`)
- Vitest has native ESM support — the netlify functions use `.mts` extensions and `type: "module"`
- First-class TypeScript support without additional config
- Built-in mocking via `vi.mock()`, `vi.fn()`, `vi.spyOn()`
- Fast startup — can easily hit the < 30s goal for the full suite

**Alternatives considered**:
- Jest: poor ESM support, would require transform config for `.mts` files
- Node test runner: no mocking primitives, insufficient for this scope

---

## R-002: Mock Strategy

**Decision**: Module-level mocking via `vi.mock()` for external dependencies

The functions have three external dependency boundaries:

| Dependency | Import Path | Mock Strategy |
|------------|-------------|---------------|
| Redis (Upstash) | `@upstash/redis` | Mock `getRedis()` to return a fake Redis object with `incr`, `expire`, `hset`, `hget`, `zadd`, `zrange`, etc. |
| OPNet RPC | `opnet`, `@btc-vision/bitcoin` | Mock `opnet`'s `JSONRpcProvider` and `getContract` |
| Netlify Blobs | `@netlify/blobs` | Mock `getStore()` to return an in-memory store |

**Key insight**: The `redis.mts` module uses a singleton pattern (`_redis` variable). Tests must reset this between runs. We'll mock `getRedis()` at the module level so all downstream consumers (redis-queries, rate-limit, redis-ohlcv) get the fake.

**In-memory Redis mock design**:
```
MockRedis = {
  store: Map<string, any>        // key → value (strings, hashes, sorted sets)
  hset, hget, hgetall, hdel      // hash operations
  set, get, incr, expire         // string/counter operations
  zadd, zrange, zrangebyscore, zrevrange, zrem, zcard  // sorted set operations
  sadd, smembers, scard          // set operations
  pipeline()                     // returns chainable mock that collects commands
  eval()                         // Lua script stub (for OHLCV)
  ping()                         // returns "PONG"
  del()                          // delete key
}
```

This mock is stateful: tests that seed data via `saveToken()` / `saveTrade()` will find it via `getToken()` / `listTradesForToken()` — just like production. This enables true integration testing of the Redis query layer.

---

## R-003: Netlify Function Handler Testing Pattern

**Decision**: Call exported default functions directly with mock `Request` and `Context` objects

Netlify Functions v2 export `(req: Request, context: Context) => Response`. We can construct a `Request` using the standard `new Request(url, init)` constructor and pass a minimal context object. No HTTP server needed.

```typescript
// Example:
const handler = (await import('./health.mts')).default;
const req = new Request('http://localhost/api/health', { method: 'GET' });
const ctx = {} as Context;
const res = await handler(req, ctx);
const body = await res.json();
```

This avoids needing Netlify CLI or any server process during tests.

---

## R-004: File Extension Strategy

**Decision**: Test files use `.test.mts` to match the source `.mts` convention

Vitest config will include `netlify/functions/**/*.test.mts` in the test pattern. This keeps test files colocated or in a parallel `__tests__` directory.

**Chosen layout**: `netlify/__tests__/` directory with subdirectories for `unit/` and `integration/`. This keeps test files out of the functions directory (which Netlify deploys) while maintaining clear organization.

---

## R-005: Bonding Curve Test Vectors

**Decision**: Hand-compute known input/output pairs for bonding curve math verification

Starting reserves: `virtualBtc = 767_000`, `virtualToken = 100_000_000_000_000_000`, `k = 76_700_000_000_000_000_000_000`, `realBtc = 0`

**Buy 100,000 sats (no flywheel tax)**:
- Fee: 100,000 × 125 / 10,000 = 1,250 sats
- netBtc = 98,750
- newVBtc = 767,000 + 98,750 = 865,750
- newVToken = k / 865,750 = 76,700,000,000,000,000,000,000 / 865,750 = 88,596,009,723,861,720 (approx)
- tokensOut = 100,000,000,000,000,000 - 88,596,009,723,861,720 = 11,403,990,276,138,280 (approx)

These will be computed precisely in test setup and verified against the simulator output.

---

## R-006: OHLCV Lua Script Testing

**Decision**: Mock `redis.eval()` to simulate the Lua script behavior in JavaScript

The `updateOHLCV` function uses a Lua script for atomic candle updates. Rather than running actual Lua, the mock's `eval()` implementation will replicate the logic:
- If candle doesn't exist: set O=H=L=C=price, V=volume
- If candle exists: update H=max(H,price), L=min(L,price), C=price, V+=volume

This is sufficient for testing that the JavaScript callers pass correct arguments.

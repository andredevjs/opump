# Phase 0 — Research: USD Display

**Date**: 2026-03-19

## R1: BTC/USD Price API Selection

**Decision**: Use CoinGecko free `/simple/price` endpoint directly from the frontend.

**Rationale**:
- CORS-enabled, no API key required for simple price queries
- Endpoint: `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`
- Rate limit: 10–30 req/min on free tier — more than sufficient for a 2-minute refresh interval
- Response: `{ "bitcoin": { "usd": 65000 } }` — minimal payload
- No Netlify proxy needed — avoids adding backend complexity for a single price fetch

**Alternatives Considered**:
| Source | Pros | Cons |
|--------|------|------|
| CoinGecko (free) | No key, CORS, simple | 10-30 req/min limit |
| Coinbase API | Reliable, no key | CORS may require proxy |
| Kraken | No key | CORS requires proxy |
| Netlify proxy to any | Full control, caching | Adds backend, deploy, latency |

**Fallback**: If CoinGecko is down, the store serves the last cached value from localStorage. No sats fallback needed per spec.

## R2: USD Formatting Strategy

**Decision**: Replace `formatBtc()` and `formatPrice()` with new `formatUsd()` and `formatUsdPrice()` functions that accept sats and return dollar strings.

**Rationale**:
- The current `formatBtc(sats)` function is called in ~15 locations. Each call site currently passes sats — the same input works for USD conversion.
- A new `formatUsd(sats)` function will: (1) convert sats → BTC, (2) multiply by cached BTC/USD rate, (3) format as dollars.
- The BTC/USD rate is read from the Zustand store at format time, keeping the formatter pure (rate is an input, not a side effect).
- Old `formatBtc`/`formatSats`/`formatPrice` functions can be removed once all call sites migrate.

## R3: Trade Form USD Input

**Decision**: Buy form input changes from BTC to USD. Sell form output changes from BTC to USD. Conversion happens at input boundary.

**Rationale**:
- Buy form currently: user types BTC → `btcToSats(btc)` → `executeBuy(sats)`
- New flow: user types USD → `usdToSats(usd, btcPrice)` → `executeBuy(sats)`
- Quick amount buttons change from BTC amounts (0.001, 0.005, etc.) to USD amounts ($5, $25, $50, $250)
- Sell form output label changes from `formatBtc(outputSats)` to `formatUsd(outputSats)`

## R4: Graduation Progress — Exception

**Decision**: Graduation progress bar keeps BTC display (reserve vs threshold).

**Rationale**: Per spec assumptions, these are protocol-level values (6.9M sats threshold is hardcoded in the contract). Showing them in fluctuating USD would be misleading — the graduation trigger is sats-denominated.

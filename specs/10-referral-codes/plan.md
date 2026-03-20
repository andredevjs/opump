# Implementation Plan: Referral Code System

**Branch**: `10-referral-codes` | **Date**: 2026-03-19 | **Spec**: specs/10-referral-codes/spec.md

## Summary

Add a referral code system where referrers earn 10% of the platform fee (0.1% of trade value) on every trade by users they referred. Codes are stored in Redis, captured via URL params, and linked to wallets on connection. No contract changes — purely application-layer tracking.

## Technical Context

**Language/Version**: TypeScript 5 (Netlify Functions + React 18)
**Primary Dependencies**: Upstash Redis, Zustand, React Router
**Storage**: Upstash Redis (following existing `op:` key pattern)
**Testing**: Manual (no test framework in frontend/backend)
**Target Platform**: Netlify Functions (backend), Vite SPA (frontend)
**Project Type**: Web application (monorepo — `netlify/` + `frontend/`)
**Constraints**: Mempool-first — referral earnings must appear immediately on trade submit, not on block confirmation

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| SafeMath for contract math | N/A | No contract changes |
| Frontend never holds signing keys | PASS | No signing involved |
| API responses follow shared types | PASS | New types added to shared/ |
| Mempool-first UI | PASS | Earnings credited at trade-submit time |

## Redis Data Model

### Key Design

Following existing patterns (`op:token:`, `op:trade:`, `op:idx:`):

```
# Referral code → referrer wallet (hash)
op:ref:code:{CODE}                → { wallet: string, createdAt: string }

# Wallet → referral code (reverse lookup, string)
op:ref:wallet:{walletAddress}     → CODE

# Referred wallet → referrer wallet (string, immutable after set)
op:ref:link:{referredWallet}      → referrerWalletAddress

# Referrer earnings (hash, updated on each referred trade)
op:ref:earnings:{referrerWallet}  → { totalSats: string, tradeCount: string, referralCount: string }

# Index: all wallets referred by a given referrer (set)
op:idx:ref:by:{referrerWallet}    → Set<referredWalletAddress>
```

### Referral Earnings Calculation

On each trade by a referred user:
```
platformFee = floor(btcAmount * 100 / 10000)    // 1% of trade
referralReward = floor(platformFee * 10 / 100)  // 10% of platform fee = 0.1% of trade
```

Earnings tracked in sats as strings (matching existing bigint-as-string pattern).

## API Endpoints

### 1. `GET /api/v1/referral/:address` — Get Referral Info

Returns the referral code and earnings for a wallet. If the wallet has no code, returns `null` for the code.

**Response:**
```json
{
  "code": "ABC123" | null,
  "earnings": {
    "totalSats": "15000",
    "tradeCount": 42,
    "referralCount": 7
  },
  "referredBy": "tb1q..." | null
}
```

### 2. `POST /api/v1/referral/link` — Link Wallet to Referral Code

Called when a user with a stored ref code connects their wallet. First-touch only — rejects if already linked.

**Request:**
```json
{
  "walletAddress": "tb1q...",
  "referralCode": "ABC123"
}
```

**Response:**
```json
{ "ok": true, "referrerAddress": "tb1p..." }
```

**Error cases:**
- Invalid code → 404
- Already linked → 200 (returns existing link, no error)
- Self-referral → 400

### 3. `POST /api/v1/referral/bulk` — Bulk Create Codes (Admin)

Protected by a shared secret in env (`ADMIN_SECRET`).

**Request:**
```json
{
  "wallets": ["tb1q...", "tb1p...", ...],
  "secret": "..."
}
```

**Response:**
```json
{
  "created": 195,
  "skipped": 5,
  "codes": [{ "wallet": "tb1q...", "code": "ABC123" }, ...]
}
```

## Implementation Design

### Backend: Trade-Submit Integration

The key integration point is `netlify/functions/trades-submit.mts`. After saving the trade and updating token stats, add:

1. Look up `op:ref:link:{traderAddress}` → referrer wallet
2. If referrer exists, calculate referral reward (10% of platform fee)
3. Increment `op:ref:earnings:{referrerWallet}` atomically via Redis HINCRBY
4. Increment trade count in earnings hash

This runs on every trade submission (mempool-first), so referral earnings appear instantly.

### Backend: Indexer Integration

The indexer (`indexer-core.mts`) also processes trades. It should NOT double-count referral earnings. Since `trades-submit` already credits the referrer optimistically, the indexer only needs to handle trades it discovers that were NOT submitted through the frontend (e.g., direct contract calls). In practice, this is rare — the indexer can skip referral logic for now and be added later if needed.

### Frontend: Ref Code Capture

1. **App initialization** (`App.tsx` or a new `useReferral` hook):
   - On mount, check URL for `?ref=CODE`
   - If present, store in `localStorage` under key `opump_ref`
   - Remove `?ref=` from URL (clean up without reload using `replaceState`)

2. **Wallet connection** (extend `wallet-store.ts` or create a `referral-store.ts`):
   - After wallet connects, check `localStorage` for `opump_ref`
   - If code exists and wallet not yet linked, call `POST /api/v1/referral/link`
   - On success, clear `localStorage` ref code (link is permanent server-side)

### Frontend: Referral Dashboard

New page at `/referral` (or section within existing profile page):
- Shows referral code + copy button + share link
- Shows earnings: total sats earned, number of referred users, number of trades
- Only visible to users with a referral code

### Frontend: Referral Store

New Zustand store `referral-store.ts`:
```
- code: string | null
- earnings: { totalSats: string, tradeCount: number, referralCount: number }
- referredBy: string | null
- fetchReferralInfo(walletAddress): Promise<void>
- linkReferral(walletAddress, code): Promise<void>
```

### Bulk Import Script

A Node.js script in `scripts/bulk-import-referrals.ts` that:
1. Reads a text file of wallet addresses (one per line)
2. Generates unique 6-char alphanumeric codes
3. Writes to Redis via Upstash REST API
4. Outputs a CSV of wallet → code mappings

This is a one-time operation, not a Netlify function.

## Affected Files

### New Files

| File | Purpose |
|------|---------|
| `netlify/functions/referral-info.mts` | `GET /api/v1/referral/:address` |
| `netlify/functions/referral-link.mts` | `POST /api/v1/referral/link` |
| `netlify/functions/referral-bulk.mts` | `POST /api/v1/referral/bulk` (admin) |
| `netlify/functions/_shared/referral-queries.mts` | Redis read/write helpers for referral data |
| `frontend/src/stores/referral-store.ts` | Zustand store for referral state |
| `frontend/src/hooks/use-referral-capture.ts` | Hook to capture `?ref=` from URL |
| `frontend/src/components/referral/ReferralDashboard.tsx` | Dashboard UI component |
| `frontend/src/pages/ReferralPage.tsx` | Page wrapper for `/referral` route |
| `shared/types/referral.ts` | Shared referral types |
| `scripts/bulk-import-referrals.ts` | One-time bulk import script |

### Modified Files

| File | Change |
|------|--------|
| `netlify/functions/trades-submit.mts` | Add referral earnings credit after trade save |
| `frontend/src/App.tsx` | Add `/referral` route, mount `useReferralCapture` hook |
| `frontend/src/services/api.ts` | Add referral API methods |
| `frontend/src/stores/wallet-store.ts` | Trigger referral link on wallet connect |

## Key Design Decisions

### 1. Referral earnings at trade-submit, not indexer
The `trades-submit` endpoint is the mempool-first entry point — it's where all frontend trades land first. Crediting referral earnings here means they appear instantly. The indexer processes confirmed blocks later but most trades go through `trades-submit` first.

### 2. Immutable first-touch attribution
Once a wallet is linked to a referrer (`op:ref:link:{wallet}`), it never changes. This prevents gaming (e.g., someone switching to their own alt's code). Redis SET with NX (set-if-not-exists) enforces this atomically.

### 3. Codes are 6-char uppercase alphanumeric
Short enough to share verbally, URL-safe, case-insensitive (stored uppercase, compared uppercase). 36^6 = 2.1 billion possible codes — more than enough for 200.

### 4. No contract changes
Referral tracking is purely application-layer. The on-chain fee structure is unchanged. The platform simply allocates 10% of its off-chain revenue to referrers.

### 5. Admin bulk endpoint protected by shared secret
Simple `ADMIN_SECRET` env var comparison. Not production-grade auth, but sufficient for a one-time admin operation. The bulk endpoint is for the initial 200 codes and future batches.

## Verification

1. Create a referral code for a test wallet
2. Visit the app with `?ref=CODE`, connect a different wallet
3. Execute a trade → verify referrer earnings increase by 10% of platform fee
4. Visit `/referral` → verify dashboard shows correct stats
5. Try self-referral → verify it's rejected
6. Try changing referral after link → verify first-touch is preserved

## Next Step

Run `/generate-tasks` to create the task list.

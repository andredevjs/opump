# Implementation Plan: OPump — Bitcoin-Native Token Launchpad

**Branch**: `1-opump-launchpad` | **Date**: 2026-03-04 | **Spec**: `specs/1-opump-launchpad/spec.md`

## Summary

Build a Bitcoin-native token launchpad on OPNet with bonding curve trading, optimistic mempool UX, and auto-graduation to DEX. The frontend is already substantially built with mock data. This plan focuses on: (1) smart contracts (AssemblyScript), (2) backend API + indexer (HyperExpress + MongoDB), (3) wiring the existing frontend to real data.

## Technical Context

| Dimension | Value |
|-----------|-------|
| **Language/Version** | TypeScript 5.x (all layers), AssemblyScript (contracts) |
| **Primary Dependencies** | `@btc-vision/btc-runtime` (contracts), `opnet` (SDK), `@btc-vision/hyper-express` (backend), `@btc-vision/uwebsocket.js` (WS), `@btc-vision/walletconnect` (frontend wallet), `@btc-vision/bitcoin` (network config), `mongodb` (database) |
| **Storage** | On-chain: OPNet contract storage (u256 pointers). Off-chain: MongoDB (tokens, trades, stats) |
| **Testing** | Contract simulation via `opnet` SDK. Backend: Vitest. Frontend: existing Vite test setup. |
| **Target Platform** | Web (SPA) + Node.js API + OPNet L1 contracts |
| **Project Type** | Full-stack (contracts + backend + frontend) |
| **Performance Goals** | SC-003: optimistic updates < 3s. SC-008: search < 500ms. |
| **Constraints** | Bitcoin ~10-min blocks. Two-transaction model. SafeMath mandatory. HyperExpress only (no Express). signer:null on frontend. |

## Constitution Compliance Check

| Principle | Status | Notes |
|-----------|--------|-------|
| 1.1 Ship Over Perfect | PASS | 6 iterative phases, each shippable |
| 1.2 Fairness Over Speed | PASS | Reservation system + optimistic UX |
| 1.3 Bitcoin-Native | PASS | Everything on OPNet L1, no bridges |
| 2.1 Three-Layer Stack | PASS | contracts/ + backend/ + frontend/ |
| 2.2 AssemblyScript + SafeMath | PASS | All contract math via SafeMath |
| 2.3 HyperExpress + MongoDB | PASS | Express forbidden, Socket.IO forbidden |
| 2.4 React + Vite + Tailwind + OPWallet | PASS | Frontend already built with this stack |
| 2.5 Shared Types + Triple Curve | PASS | Shared types dir planned. 3 curve impls. |
| 3.1 Iterative Phases | PASS | Phases match constitution exactly |
| 3.3 Testnet-First | PASS | All dev on `networks.opnetTestnet` |
| 4.1–4.3 Security | PASS | See security section below |
| 5.1–5.3 UX | PASS | 3-layer optimistic, transparent fees, mobile-ready |

**No violations detected.**

## Project Structure

```
opump/
├── contracts/                          # NEW — AssemblyScript smart contracts
│   ├── assembly/
│   │   ├── LaunchToken.ts              # Bonding curve token (extends OP20)
│   │   ├── OPumpFactory.ts             # Token registry + deployer
│   │   ├── lib/
│   │   │   ├── BondingCurve.ts         # Curve math (SafeMath)
│   │   │   └── Constants.ts            # Shared constants (k, thresholds, fees)
│   │   └── index.ts                    # Entry points
│   ├── asconfig.json                   # AssemblyScript config
│   ├── package.json
│   └── scripts/
│       └── deploy.mjs                  # Deployment script (testnet)
│
├── backend/                            # NEW — Node.js API + indexer
│   ├── src/
│   │   ├── index.ts                    # Server entry (HyperExpress + WS)
│   │   ├── config/
│   │   │   ├── env.ts                  # Environment config
│   │   │   └── constants.ts            # Shared constants (mirrors contract)
│   │   ├── db/
│   │   │   ├── connection.ts           # MongoDB connection
│   │   │   ├── models/
│   │   │   │   ├── Token.ts            # Token collection
│   │   │   │   ├── Trade.ts            # Trade collection
│   │   │   │   └── PlatformStats.ts    # Stats singleton
│   │   │   └── indexes.ts             # Index setup
│   │   ├── services/
│   │   │   ├── IndexerService.ts       # Block polling (5s), confirmed trade indexing
│   │   │   ├── MempoolService.ts       # Mempool polling (800ms), pending tx detection
│   │   │   ├── OptimisticStateService.ts # Pending trades → optimistic reserves
│   │   │   ├── BondingCurveSimulator.ts  # Server-side curve math (mirrors contract)
│   │   │   └── WebSocketService.ts     # WS subscription management + broadcast
│   │   ├── routes/
│   │   │   ├── tokens.ts              # /v1/tokens routes
│   │   │   ├── simulate.ts           # /v1/simulate routes
│   │   │   ├── stats.ts              # /v1/stats route
│   │   │   └── profile.ts            # /v1/profile routes
│   │   └── middleware/
│   │       ├── cors.ts
│   │       ├── rateLimit.ts
│   │       └── validate.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── shared/                             # NEW — Shared types across layers
│   ├── types/
│   │   ├── token.ts                    # Token interfaces
│   │   ├── trade.ts                    # Trade interfaces
│   │   └── api.ts                      # API request/response types
│   └── constants/
│       └── bonding-curve.ts            # Curve constants (used by all 3 layers)
│
├── frontend/                           # EXISTS — needs backend wiring
│   ├── src/
│   │   ├── services/                   # NEW — replace mock/ with real API calls
│   │   │   ├── api.ts                  # REST API client
│   │   │   ├── websocket.ts            # WebSocket client + subscription manager
│   │   │   └── contract.ts             # OPNet contract interaction (getContract, simulate, send)
│   │   ├── hooks/                      # UPDATE — wire to real services
│   │   │   ├── use-bonding-curve.ts    # Update to use shared constants
│   │   │   ├── use-price-feed.ts       # Update to use WebSocket
│   │   │   ├── use-trade-simulation.ts # Update to use API simulate endpoint
│   │   │   ├── use-wallet.ts           # NEW — OPWallet via @btc-vision/walletconnect
│   │   │   └── use-contract.ts         # NEW — cached contract instances
│   │   ├── stores/                     # UPDATE — sync with backend
│   │   └── mock/                       # KEEP — fallback for offline dev
│   └── ...
│
├── specs/1-opump-launchpad/            # EXISTS — planning artifacts
│   ├── spec.md
│   ├── constitution.md
│   ├── plan.md                         # THIS FILE
│   ├── research.md
│   ├── data-model.md
│   └── contracts/
│       ├── rest-api.md
│       ├── websocket-api.md
│       └── smart-contracts.md
│
└── documents/                          # EXISTS — design docs
```

## Implementation Phases

---

### Phase 1 — Core Loop (Contracts + Backend + Frontend Wiring)

**Goal**: A user can create a token and buy/sell on testnet.

#### 1.1 Smart Contracts

**1.1.1 Project Setup**
- Initialize `contracts/` with AssemblyScript toolchain
- `package.json` with `@btc-vision/btc-runtime`, `@btc-vision/as-bignum`
- `asconfig.json` targeting WASM
- Pointer allocation plan (see `data-model.md`)

**1.1.2 LaunchToken Contract**
- Extend OP20 with bonding curve storage (pointers 7–27)
- `onDeployment()`: initialize reserves, k constant, creator allocation mint
- `buy(btcAmount)`: constant-product AMM buy with fee split (1.5%)
  - SafeMath for ALL arithmetic
  - `tokensOut = virtualTokenSupply - (kConstant / (virtualBtcReserve + netBtc))`
  - `_mint(buyer, tokensOut)`
  - Update reserves
- `sell(tokenAmount)`: inverse AMM sell with fee split
  - `btcOut = virtualBtcReserve - (kConstant / (virtualTokenSupply + tokenAmount))`
  - `_burn(seller, tokenAmount)`
- `getReserves()`, `getPrice()`: read-only queries
- Min trade amount check (10,000 sats)
- Graduation threshold check (set flag, block further trades)

**1.1.3 OPumpFactory Contract**
- Token registry (deploy, index, lookup)
- `deployToken()`: validate params, register new token
- `getTokenCount()`, `getTokenAtIndex()`, `getStats()`

**1.1.4 Deploy to Testnet**
- `scripts/deploy.mjs` using OPNet CLI
- Deploy factory first, then verify with a test token deploy

#### 1.2 Shared Types

**1.2.1 Create shared/ directory**
- Token, Trade, API types used by backend + frontend
- Bonding curve constants (INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, K, fees, thresholds)
- Configure both backend and frontend to import from shared/

#### 1.3 Backend

**1.3.1 Project Setup**
- Initialize `backend/` with HyperExpress, MongoDB driver, `opnet` SDK
- `package.json` per OPNet backend package versions (see research.md)
- Environment config (.env.example with OPNET_RPC_URL, MONGO_URL, etc.)
- MongoDB connection + collection setup + indexes

**1.3.2 Core Services**
- `IndexerService`: poll blocks every 5s via `JSONRpcProvider.getBlockNumber()`, detect LaunchToken buy/sell events, upsert trades in MongoDB, update token reserves
- `BondingCurveSimulator`: TypeScript mirror of contract math (bigint arithmetic). Used by simulate endpoints. Must produce identical output to contract.

**1.3.3 REST API Routes**
- `GET /v1/tokens` — list with pagination, filter, sort, search
- `GET /v1/tokens/:address` — token detail
- `GET /v1/tokens/:address/trades` — trade history
- `GET /v1/tokens/:address/price` — current reserves/price
- `POST /v1/simulate/buy` — simulate buy
- `POST /v1/simulate/sell` — simulate sell
- `GET /v1/stats` — platform stats
- Input validation + rate limiting + CORS

#### 1.4 Frontend Wiring

**1.4.1 API Client Service**
- Create `frontend/src/services/api.ts` — fetch wrapper for all REST endpoints
- Replace mock API imports in stores/hooks with real API calls
- Keep mock data as fallback (environment variable toggle)

**1.4.2 OPWallet Integration**
- Install `@btc-vision/walletconnect`
- Create `use-wallet.ts` hook wrapping `useWalletConnect`
- Replace mock wallet store with real wallet connection
- Apply mandatory WalletConnect modal CSS fix

**1.4.3 Contract Interaction**
- Create `frontend/src/services/contract.ts`
- Cached `getContract()` instances per token address
- Buy flow: `contract.buy(amount)` → check revert → `sim.sendTransaction({ signer: null, mldsaSigner: null, ... })`
- Sell flow: same pattern with `contract.sell(amount)`
- Wire BuyForm and SellForm components to real contract calls

---

### Phase 2 — UX Layer (Real-Time + Optimistic)

**Goal**: Trades feel instant (~3s feedback) despite 10-min blocks.

#### 2.1 Backend Services

**2.1.1 MempoolService**
- Poll mempool every 800ms via OPNet RPC
- Detect pending buy/sell transactions for tracked tokens
- Emit events to OptimisticStateService

**2.1.2 OptimisticStateService**
- Maintain in-memory state: confirmed reserves + pending trade adjustments
- When pending trade detected: simulate trade on top of confirmed reserves
- When trade confirmed: remove from pending, update confirmed base
- When trade dropped: roll back optimistic adjustment, notify clients

**2.1.3 WebSocketService**
- HyperExpress `.ws('/ws')` handler
- Subscription management: subscribe/unsubscribe to channels
- Broadcast: price updates, new trades, trade confirmations, trade drops
- 30s heartbeat ping/pong

#### 2.2 Frontend Integration

**2.2.1 WebSocket Client**
- Create `frontend/src/services/websocket.ts`
- Auto-connect, auto-reconnect, subscription manager
- Wire to Zustand stores: price updates → price-store, trades → trade-store

**2.2.2 Optimistic UX**
- Update price displays to show "~" prefix for optimistic prices
- Trade history: show pending trades with spinner, confirmed with green badge
- Auto-transition when confirmation arrives via WebSocket
- Rollback UI when `trade_dropped` event received

**2.2.3 Trade Simulation Panel**
- Wire `use-trade-simulation` hook to `POST /v1/simulate/buy|sell`
- Show: exact output, fee breakdown, price impact %, new price after trade
- Debounce simulation calls (300ms)

---

### Phase 3 — Discovery (Trenches + Landing)

**Goal**: Users can find tokens without knowing the address.

#### 3.1 Backend

**3.1.1 Search & Sort**
- MongoDB text index on `name` + `symbol` for full-text search
- Sort indexes: `volume24h`, `marketCapSats`, `currentPriceSats`, `deployBlock`
- `GET /v1/tokens` query optimization for 1,000+ tokens (< 500ms target)

**3.1.2 Stats Aggregation**
- `PlatformStats` singleton updated by IndexerService on each block
- `GET /v1/stats` returns from MongoDB (no computation on request)

#### 3.2 Frontend

**3.2.1 Trenches Page**
- Wire existing TrenchesPage component to `GET /v1/tokens` with query params
- Connect search input, status filter, sort dropdown to API params
- Pagination via API (not client-side)

**3.2.2 Landing Page**
- Wire PlatformStats component to `GET /v1/stats`
- Wire RecentTokens and TopTokens to `GET /v1/tokens` with sort params

---

### Phase 4 — Rewards (Minter + Creator + Flywheel)

**Goal**: Creators and early buyers earn revenue.

#### 4.1 Contract Updates

**4.1.1 Minter Tracking**
- In `buy()`: if `currentBlock - deployBlock < 4320`, record minter share
- Store `minterBuyBlock` and `minterShares` per address
- `claimMinterReward()`: check eligibility (buy in window + 30-day hold + still holds tokens), calculate proportional share, zero out shares

**4.1.2 Creator Fee Claiming**
- `claimCreatorFees()`: deployer-only, read pool, zero and return

**4.1.3 Flywheel Tax**
- Apply configurable `buyTaxBps`/`sellTaxBps` on top of base 1.5% fee
- Route to destination (burn via `_burn`, community pool pointer, or creator balance)

#### 4.2 Frontend

**4.2.1 Fee Display**
- Update FeeBreakdown component to show flywheel tax separately
- Show minter reward eligibility on token detail page
- Creator dashboard: show accumulated fees + claim button

---

### Phase 5 — Graduation (MotoSwap Migration)

**Goal**: Tokens transition to full DEX trading.

#### 5.1 Contract

**5.1.1 Graduation Trigger**
- In `buy()`: after updating `realBtcReserve`, check `>= graduationThreshold`
- Set `graduated = true`, emit `GraduationEvent`
- Block all subsequent `buy()` and `sell()` calls

**5.1.2 Liquidity Migration** (deferred until MotoSwap available on testnet)
- When MotoSwap contracts are deployed: add `migrate()` method
- Transfer accumulated BTC + remaining tokens to MotoSwap pool
- For now: graduation sets flag only; migration is manual/admin

#### 5.2 Backend

- IndexerService detects `GraduationEvent`, updates token status in MongoDB
- WebSocketService broadcasts `token_graduated` event
- API returns `graduated` status + MotoSwap link (when available)

#### 5.3 Frontend

- GraduationProgress component already exists
- Show "Graduated" badge on token card/detail
- Disable buy/sell panel, show "Trade on MotoSwap" link

---

### Phase 6 — Polish (Profiles + Mobile + Deploy)

**Goal**: Production-ready for mainnet.

#### 6.1 Features
- Creator profile page: wire to `GET /v1/profile/:address/tokens`
- Holdings tab: query token balances via contract `balanceOf()`
- Animations: Framer Motion already installed, add trade confirmations
- Mobile optimization: responsive layouts (already scaffolded in Tailwind)

#### 6.2 Image Storage Migration
- If scaling requires: migrate from MongoDB base64 to S3 presigned uploads
- Update `POST /v1/tokens` to accept S3 URL instead of base64

#### 6.3 Deployment
- Frontend: Netlify (netlify.toml already exists) or IPFS
- Backend: Docker container → VPS
- Contracts: mainnet deployment after full testnet validation

#### 6.4 Security Audit
- Run OPNet audit checklist on LaunchToken + OPumpFactory
- Verify bonding curve math across all 3 implementations
- Penetration test: reservation system, fee calculations, overflow edges

---

## Shared Bonding Curve Test Vectors

These test vectors MUST produce identical results across contract, backend, and frontend:

| Scenario | Input | Expected Output |
|----------|-------|-----------------|
| First buy | 100,000 sats | tokensOut = `virtualTokenSupply - (k / (virtualBtcReserve + 98,500))` where 98,500 = 100,000 - 1.5% fee |
| First sell (after buy) | All tokens from above | btcOut ≈ 98,500 sats minus fees (round-trip loss = fees only) |
| Min trade | 10,000 sats | Succeeds |
| Below min | 9,999 sats | Revert: "Below minimum trade amount" |
| Graduation trigger | Cumulative real BTC = 6,900,000 sats | `graduated = true`, further trades blocked |
| Buy after graduation | Any amount | Revert: "Token has graduated" |

Exact values to be computed during implementation and stored in `shared/constants/test-vectors.ts`.

## Security Considerations

| Area | Measure |
|------|---------|
| Contract overflow | SafeMath on ALL u256 ops. No raw +, -, *, / |
| Front-running | Reservation system with price locking (3-block TTL) |
| Reservation abuse | 50% cancel penalty, 90% squatting penalty |
| Dust spam | 10,000 sats minimum trade |
| Frontend keys | signer: null, mldsaSigner: null — OPWallet signs |
| XSS | Sanitize token metadata (name, description, URLs) |
| MongoDB injection | Parameterized queries only |
| Rate limiting | Backend rate limiter on all public endpoints |
| Secret management | .env files, never committed |

## Dependency Map

```
Phase 1.1 (Contracts) ─────┐
Phase 1.2 (Shared Types) ──┼── Phase 1.3 (Backend) ── Phase 1.4 (Frontend Wiring)
                            │
                            └── Phase 2 (Real-Time UX) ── Phase 3 (Discovery)
                                                              │
                                                              ├── Phase 4 (Rewards)
                                                              │
                                                              └── Phase 5 (Graduation)
                                                                      │
                                                                      └── Phase 6 (Polish)
```

Phases 1.1 and 1.2 can run in parallel. Phase 1.3 depends on 1.2. Phase 1.4 depends on 1.3.
Phases 2–6 are sequential (each builds on the prior).

## Generated Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| Research | `specs/1-opump-launchpad/research.md` | Technology decisions + risk analysis |
| Data Model | `specs/1-opump-launchpad/data-model.md` | On-chain storage + MongoDB schemas |
| REST API | `specs/1-opump-launchpad/contracts/rest-api.md` | All HTTP endpoints with request/response |
| WebSocket API | `specs/1-opump-launchpad/contracts/websocket-api.md` | WS channels + message format |
| Smart Contracts | `specs/1-opump-launchpad/contracts/smart-contracts.md` | Contract ABIs + method specs |
| Plan | `specs/1-opump-launchpad/plan.md` | This file |

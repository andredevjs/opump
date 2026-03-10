# Task List: OPump — Bitcoin-Native Token Launchpad

**Branch**: `1-opump-launchpad`
**Generated**: 2026-03-04
**Total Tasks**: 62
**Source**: `plan.md`, `spec.md`, `data-model.md`, `contracts/`

---

## Phase 1: Setup

Project scaffolding, dependencies, and configuration for all three layers.

- [x] T001 [P] Initialize contracts project: create `contracts/package.json` with `@btc-vision/btc-runtime@rc`, `@btc-vision/as-bignum@0.1.2`, `@btc-vision/opnet-transform`; **CRITICAL**: install `@btc-vision/assemblyscript` (custom fork) and ensure upstream `assemblyscript` is NOT installed (uninstall if present); create `contracts/asconfig.json` targeting WASM; create `contracts/tsconfig.json`
- [x] T002 [P] Initialize backend project: create `backend/package.json` with `@btc-vision/hyper-express`, `@btc-vision/uwebsocket.js`, `opnet@rc`, `@btc-vision/bitcoin@rc`, `@btc-vision/transaction@rc`, `mongodb`; create `backend/tsconfig.json` (ESNext, NodeNext); run `npx npm-check-updates -u && npm i`
- [x] T003 [P] Create `backend/.env.example` with all environment variables: PORT, MONGO_URL, MONGO_DB_NAME, OPNET_RPC_URL, NETWORK, FACTORY_ADDRESS, INDEXER_POLL_MS (5000), MEMPOOL_POLL_MS (800)
- [x] T004 [P] Install OPWallet integration in frontend: add `@btc-vision/walletconnect`, `@btc-vision/bitcoin@rc`, `opnet@rc` to `frontend/package.json`; run `npx npm-check-updates -u && npm i`
- [x] T005 [P] Create `shared/` directory: `shared/types/token.ts`, `shared/types/trade.ts`, `shared/types/api.ts`, `shared/constants/bonding-curve.ts`; configure `frontend/tsconfig.json` and `backend/tsconfig.json` path aliases to import from `shared/`

**Parallel**: T001–T005 are all independent (different directories).

---

## Phase 2: Foundational

Shared types, bonding curve constants, DB models — blocking prerequisites for all user stories.

- [x] T006 Define shared bonding curve constants in `shared/constants/bonding-curve.ts`: INITIAL_VIRTUAL_BTC_SATS (3_000_000_000n), INITIAL_VIRTUAL_TOKEN_SUPPLY (100_000_000_000_000_000n), K_CONSTANT, GRADUATION_THRESHOLD_SATS (6_900_000n), MIN_TRADE_SATS (10_000n), PLATFORM_FEE_BPS (100), CREATOR_FEE_BPS (25), MINTER_FEE_BPS (25), TOTAL_FEE_BPS (150), MINTER_WINDOW_BLOCKS (4320), MINTER_HOLD_BLOCKS (4320), MAX_CREATOR_ALLOCATION_BPS (1000), MAX_AIRDROP_BPS (2000), MAX_COMBINED_ALLOCATION_BPS (2500), RESERVATION_TTL_BLOCKS (3)
- [x] T007 Define shared Token type in `shared/types/token.ts`: TokenDocument interface matching data-model.md MongoDB schema (address, name, symbol, description, imageData, socials, reserves, config, status, stats, timestamps)
- [x] T008 [P] Define shared Trade type in `shared/types/trade.ts`: TradeDocument interface (txHash, tokenAddress, type, traderAddress, amounts, fees, priceImpact, status, blockNumber, timestamps)
- [x] T009 [P] Define shared API types in `shared/types/api.ts`: request/response interfaces for all REST endpoints per `contracts/rest-api.md` (TokenListResponse, TokenDetailResponse, TradeListResponse, SimulateBuyRequest/Response, SimulateSellRequest/Response, PriceResponse, StatsResponse, PaginationMeta)
- [x] T010 Create MongoDB connection in `backend/src/db/connection.ts`: singleton MongoClient using env MONGO_URL, getDb() helper returning database instance
- [x] T011 Create MongoDB models in `backend/src/db/models/Token.ts`, `Trade.ts`, `PlatformStats.ts`: typed collection accessors using shared types from `shared/types/`
- [x] T012 Create MongoDB index setup in `backend/src/db/indexes.ts`: ensure indexes on tokens (status+volume24h, creatorAddress, text on name+symbol, deployBlock, currentPriceSats) and trades (tokenAddress+createdAt, traderAddress+createdAt, status+tokenAddress, blockNumber) per data-model.md
- [x] T013 Create backend environment config in `backend/src/config/env.ts`: load and validate all .env variables with defaults, export typed Config object
- [x] T014 Create backend entry point in `backend/src/index.ts`: HyperExpress server with CORS middleware, global error handler (no stack trace leaks), health check endpoint, graceful shutdown; listen on Config.PORT

**Dependencies**: T006–T009 depend on T005. T010–T014 depend on T002+T003.

---

## Phase 3: US1 — Create and Launch a Token (P1)

**Goal**: A creator completes the wizard and deploys a token on testnet.
**Build order**: Contract → Backend → Frontend

### Contract Layer

- [x] T015 [US1] Create bonding curve math library in `contracts/assembly/lib/BondingCurve.ts`: static methods `calculateBuy(virtualBtc, virtualToken, k, btcIn) → tokensOut` and `calculateSell(virtualBtc, virtualToken, k, tokensIn) → btcOut` using SafeMath only. Also `calculateFees(amount, feeBps) → feeAmount`. All u256.
- [x] T016 [US1] Create constants in `contracts/assembly/lib/Constants.ts`: INITIAL_VIRTUAL_BTC, INITIAL_VIRTUAL_TOKEN, PLATFORM_FEE_BPS, CREATOR_FEE_BPS, MINTER_FEE_BPS, MIN_TRADE_AMOUNT, DEFAULT_GRADUATION_THRESHOLD, MINTER_WINDOW_BLOCKS, MINTER_HOLD_BLOCKS as u256 values
- [x] T017 [US1] Create LaunchToken contract in `contracts/assembly/LaunchToken.ts`: extend OP20; declare all storage pointers (7–27 per data-model.md) using `Blockchain.nextPointer`; declare all selectors via `encodeSelector()`; implement `onDeployment(calldata)` reading name, symbol, maxSupply, creatorAllocationBps, buyTaxBps, sellTaxBps, flywheelDestination, graduationThreshold from calldata; call `this.instantiate()` with OP20InitParameters; initialize virtual reserves and k constant; mint creator allocation to `Blockchain.tx.origin`. **Bob MCP constraints**: use `Uint8Array` everywhere (NO Buffer); all `@method()` decorators MUST declare params explicitly (bare `@method()` is FORBIDDEN); fee pools (platform, creator, minter) are u256 counters tracking amounts owed — contracts CANNOT hold BTC; BytesWriter size must exactly match data written
- [x] T018 [US1] Implement `callMethod()` override in `contracts/assembly/LaunchToken.ts`: switch on selector for buy, sell, getReserves, getPrice, getConfig, isGraduated, reserve, cancelReservation, claimCreatorFees, claimMinterReward, getMinterInfo, getReservation; **MANDATORY**: default case must call `super.callMethod()` for OP20 built-ins (omitting this makes inherited methods unreachable). Mark read-only methods with `constant` ABI flag; mark `buy()` and `reserve()` with `payable` ABI flag (VM-enforced)
- [x] T019 [US1] Implement read-only methods in `contracts/assembly/LaunchToken.ts`: `getReserves()` returns virtualBtc, virtualToken, realBtc, k; `getPrice()` calculates current price from reserves; `getConfig()` returns all config values; `isGraduated()` returns graduated boolean
- [x] T020 [US1] Create OPumpFactory contract in `contracts/assembly/OPumpFactory.ts`: extend OP_NET; storage for tokenCount, tokenRegistry, creatorTokens, totalVolume, graduatedCount, platformFeeRecipient; implement `deployToken()` with param validation (combined allocation <= 25%), register in registry, emit TokenDeployedEvent; implement `getTokenCount()`, `getTokenAtIndex()`, `getTokensByCreator()`, `getStats()` read-only methods. **Bob MCP**: all `@method()` decorators must declare params; read-only methods must be marked `constant`; use `Uint8Array` (NO Buffer); `callMethod()` default must call `super.callMethod()`
- [x] T021 [US1] Create contract entry points: `contracts/assembly/index.ts` for LaunchToken and `contracts/assembly/factory-index.ts` for OPumpFactory. Each entry point MUST have THREE elements per Bob MCP: (1) factory function that instantiates the contract, (2) runtime exports (`__execute`, memory), (3) custom abort handler (NOT the default AssemblyScript abort). Add build scripts to `contracts/package.json`: `build:token` and `build:factory` compiling to WASM via `@btc-vision/opnet-transform`
- [x] T022 [US1] Create deployment script `contracts/scripts/deploy.mjs`: deploy OPumpFactory to testnet using OPNet CLI; log deployed address; save to config

### Backend Layer

- [x] T023 [US1] Create BondingCurveSimulator service in `backend/src/services/BondingCurveSimulator.ts`: TypeScript class with `simulateBuy(reserves, btcAmountSats)` and `simulateSell(reserves, tokenAmount)` using bigint arithmetic; must produce identical results to contract math (use shared constants from `shared/constants/bonding-curve.ts`); returns tokensOut/btcOut, fee breakdown, new reserves, price impact
- [x] T024 [US1] Create token registration route in `backend/src/routes/tokens.ts`: `POST /v1/tokens` accepting token metadata (name, symbol, description, imageData as base64, socials, creatorAddress, contractAddress, config, deployTxHash); validate required fields; insert into MongoDB tokens collection; return 201 with created document
- [x] T025 [US1] Create token query routes in `backend/src/routes/tokens.ts`: `GET /v1/tokens` with pagination (page, limit), filter (status: all/active/graduated), search (MongoDB text search on name+symbol), sort (volume24h, marketCap, price, newest); `GET /v1/tokens/:address` returning full token detail; return 404 if not found
- [x] T026 [US1] Create simulate routes in `backend/src/routes/simulate.ts`: `POST /v1/simulate/buy` accepting tokenAddress + btcAmountSats, looking up token reserves from MongoDB, calling BondingCurveSimulator, returning tokensOut + fees + priceImpact + newPrice; `POST /v1/simulate/sell` with same pattern; validate min trade amount (10,000 sats); return 400 for invalid input
- [x] T027 [US1] Register all routes in `backend/src/index.ts`: import and mount token routes, simulate routes; add input validation middleware in `backend/src/middleware/validate.ts`; add rate limiter in `backend/src/middleware/rateLimit.ts` (100 req/min per IP)

### Frontend Layer

- [x] T028 [US1] Create REST API client in `frontend/src/services/api.ts`: typed fetch wrapper for all backend endpoints per `contracts/rest-api.md`; use shared types from `shared/types/api.ts`; environment-based base URL from VITE_API_URL; include error handling (parse JSON error responses)
- [x] T029 [US1] Create OPWallet hook in `frontend/src/hooks/use-wallet.ts`: wrap `@btc-vision/walletconnect` `useWalletConnect()`; expose connect/disconnect/address/network/isConnected; handle network switch (clear caches, no page refresh); apply mandatory WalletConnect modal CSS fix in `frontend/src/index.css`
- [x] T030 [US1] Update wallet store in `frontend/src/stores/wallet-store.ts`: replace mock wallet with real OPWallet integration using `use-wallet.ts` hook; store real address and balance from wallet
- [x] T031 [US1] Create contract service in `frontend/src/services/contract.ts`: singleton JSONRpcProvider (cached); `getTokenContract(address)` returning cached `ILaunchTokenContract` via `getContract()` from `opnet`; `getFactoryContract()` for OPumpFactory; clear cache on network switch
- [x] T032 [US1] Wire Launch wizard's StepDeploy component (`frontend/src/components/launch/StepDeploy.tsx`): on deploy click, call factory contract `deployToken()` with wizard form data; simulate first, check revert; send with `signer: null, mldsaSigner: null`; after tx confirmed, call `POST /v1/tokens` to register metadata in backend; show tx hash and link to token page
- [x] T033 [US1] Update token store in `frontend/src/stores/token-store.ts`: replace mock token fetching with calls to `GET /v1/tokens` and `GET /v1/tokens/:address` via API client; add environment toggle to fall back to mock data (`VITE_USE_MOCK=true`)

---

## Phase 4: US2+US3 — Buy and Sell Tokens (P1)

**Goal**: Traders can buy/sell tokens on the bonding curve with simulated previews.

### Contract Layer

- [x] T034 [US2] Implement `buy()` method in `contracts/assembly/LaunchToken.ts`: read btcAmount from calldata; revert if graduated; revert if < minTradeAmount; calculate 1.5% fee split (platform/creator/minter pools); calculate flywheel buy tax; compute tokensOut via BondingCurve.calculateBuy(); update virtualBtcReserve and virtualTokenSupply; update realBtcReserve; `_mint(Blockchain.tx.sender, tokensOut)`; track minter eligibility if within first 4320 blocks; check graduation threshold; emit BuyEvent
- [x] T035 [US3] Implement `sell()` method in `contracts/assembly/LaunchToken.ts`: read tokenAmount from calldata; revert if graduated; compute btcOut via BondingCurve.calculateSell(); calculate fee split; calculate flywheel sell tax; `_burn(Blockchain.tx.sender, tokenAmount)`; update reserves; emit SellEvent
- [x] T036 [US2] Implement reservation methods in `contracts/assembly/LaunchToken.ts`: `reserve(btcAmount)` stores reservation with expiry = currentBlock + 3, reverts if active reservation exists; `cancelReservation()` applies 50% penalty and clears; `getReservation(address)` returns active reservation details

### Frontend Layer

- [x] T037 [US2] Create contract interaction hook in `frontend/src/hooks/use-contract.ts`: `useTokenContract(address)` returning cached contract instance; `useBuy(tokenAddress)` returning `{ buy, isLoading, error }` that simulates then sends with `signer: null, mldsaSigner: null`; `useSell(tokenAddress)` with same pattern
- [x] T038 [US2] Wire BuyForm component (`frontend/src/components/trade/BuyForm.tsx`): on amount change, call `POST /v1/simulate/buy` (debounced 300ms) to show token output, fee breakdown, price impact; on submit, call `useBuy()` hook; show loading spinner during broadcast; show error from revert message; disable button if amount < 10,000 sats
- [x] T039 [US3] Wire SellForm component (`frontend/src/components/trade/SellForm.tsx`): on amount change, call `POST /v1/simulate/sell` (debounced 300ms); on submit, call `useSell()` hook; validate that user has sufficient token balance; disable if amount < minimum equivalent
- [x] T040 [US2] Update `frontend/src/hooks/use-trade-simulation.ts`: replace mock simulation with real calls to `POST /v1/simulate/buy` and `POST /v1/simulate/sell` via API client; debounce 300ms; return loading state, simulation result, and error

---

## Phase 5: US5 — Real-Time Optimistic Trading UX (P1)

**Goal**: Trades feel instant (~3s feedback) despite 10-minute blocks.

### Backend Layer

- [x] T041 [US5] Create IndexerService in `backend/src/services/IndexerService.ts`: poll `provider.getBlockNumber()` every 5s; on new block, fetch block data and scan for LaunchToken buy/sell events; upsert confirmed trades in MongoDB (update status from pending→confirmed); update token reserves in MongoDB from on-chain state; update PlatformStats (totalVolume, totalTrades, lastBlockIndexed); emit events to WebSocketService
- [x] T042 [US5] Create MempoolService in `backend/src/services/MempoolService.ts`: poll mempool every 800ms via OPNet RPC; detect pending buy/sell transactions for tracked tokens; insert pending trades in MongoDB (status: pending); emit pending trade events to OptimisticStateService and WebSocketService; detect dropped txs (previously seen, now missing) and emit drop events
- [x] T043 [US5] Create OptimisticStateService in `backend/src/services/OptimisticStateService.ts`: maintain in-memory map of token address → { confirmedReserves, pendingAdjustments[] }; on pending trade: simulate via BondingCurveSimulator, add adjustment; on confirmed: remove from pending, update confirmed base from MongoDB; on dropped: remove adjustment, recalculate optimistic state; expose `getOptimisticPrice(tokenAddress)` returning reserves with pending trades applied
- [x] T044 [US5] Create WebSocketService in `backend/src/services/WebSocketService.ts`: HyperExpress `.ws('/ws', { ... })` handler per `contracts/websocket-api.md`; manage subscriptions map (ws → channels[]); handle subscribe/unsubscribe messages; `broadcast(channel, event, data)` to all subscribed clients; 30s ping/pong heartbeat; clean up on disconnect
- [x] T045 [US5] Wire services together in `backend/src/index.ts`: instantiate IndexerService, MempoolService, OptimisticStateService, WebSocketService; IndexerService emits to WebSocketService (new_block, trade_confirmed, token_graduated); MempoolService emits to OptimisticStateService and WebSocketService (new_trade pending, trade_dropped); update `GET /v1/tokens/:address/price` to use OptimisticStateService for `isOptimistic` flag and pending amounts
- [x] T046 [US5] Create trade history route in `backend/src/routes/tokens.ts`: `GET /v1/tokens/:address/trades` returning confirmed + pending trades from MongoDB, sorted by createdAt descending, with pagination
- [x] T047 [US5] Create price route in `backend/src/routes/tokens.ts`: `GET /v1/tokens/:address/price` returning current price, reserves, isOptimistic flag, and pending buy/sell amounts from OptimisticStateService

### Frontend Layer

- [x] T048 [US5] Create WebSocket client in `frontend/src/services/websocket.ts`: connect to `VITE_WS_URL`; auto-reconnect with exponential backoff; subscribe/unsubscribe methods; message parsing and routing to callbacks; pong response to server pings
- [x] T049 [US5] Wire WebSocket to stores: in `frontend/src/stores/price-store.ts`, subscribe to `token:price:{address}` on token page mount, update price on `price_update` events; in `frontend/src/stores/trade-store.ts`, subscribe to `token:trades:{address}`, add pending trades on `new_trade`, update on `trade_confirmed`, remove on `trade_dropped`
- [x] T050 [US5] Update price display components to show optimistic indicator: in TokenPrice component, show "~" prefix when `isOptimistic: true`; in TradeHistory component, show spinner icon for status=pending trades, green checkmark for confirmed; animate transition from pending to confirmed
- [x] T051 [US5] Update `frontend/src/hooks/use-price-feed.ts`: replace 2.5s polling with WebSocket subscription; subscribe on mount, unsubscribe on unmount; fall back to polling if WebSocket disconnects

---

## Phase 6: US4 — Discover Tokens in the Trenches (P1)

**Goal**: Users can search, filter, and sort tokens.

- [x] T052 [US4] Wire TrenchesPage (`frontend/src/pages/TrenchesPage.tsx`): replace mock token list with `GET /v1/tokens` API call passing search, status, sort, page params; wire search input to `search` param; wire status filter buttons to `status` param; wire sort dropdown to `sort` + `order` params; wire pagination to `page` param; show loading skeleton during fetch
- [x] T053 [US4] Wire TokenCard and TokenList components (`frontend/src/components/token/TokenCard.tsx`, `TokenList.tsx`): map API response fields to existing component props; ensure graduation progress bar uses `realBtcReserve / graduationThreshold * 100`; link to `/token/:address`

---

## Phase 7: US6 — Token Graduation to DEX (P2)

**Goal**: Tokens auto-graduate when BTC reserve hits 6.9M sats.

- [x] T054 [US6] Complete graduation logic in `contracts/assembly/LaunchToken.ts`: in `buy()` after updating `realBtcReserve`, check `>= graduationThreshold`; set `graduated.set(true)`; emit `GraduationEvent(contractAddress, realBtcReserve)`; ensure all subsequent `buy()` and `sell()` calls revert with "Token has graduated"
- [x] T055 [US6] Update IndexerService in `backend/src/services/IndexerService.ts`: detect GraduationEvent in block scanning; update token status to 'graduated' in MongoDB with `graduatedAt` block number; increment PlatformStats.totalGraduated; emit `token_graduated` event to WebSocketService
- [x] T056 [US6] Update frontend token detail page (`frontend/src/pages/TokenPage.tsx`): when token.status === 'graduated', show "Graduated" badge; disable TradePanel (buy/sell forms); show "Trade on MotoSwap" message/link; GraduationProgress component at 100%

---

## Phase 8: US7+US8 — Minter Rewards and Creator Fees (P2)

**Goal**: Creators and early buyers earn revenue from trading fees.

- [x] T057 [US7] Complete minter tracking in `contracts/assembly/LaunchToken.ts`: in `buy()`, if `Blockchain.block.number - deployBlock < MINTER_WINDOW_BLOCKS`, record buyer in minterShares map (proportional to tokens purchased) and minterBuyBlock map; increment totalMinterShares; implement `claimMinterReward()` checking eligibility (bought in window, held for 4320 blocks, still holds tokens > 0), calculating proportional share of minterFeePool, zeroing shares to prevent double-claim; implement `getMinterInfo(address)` read-only returning shares, buyBlock, eligibility status
- [x] T058 [US8] Complete creator fee claiming in `contracts/assembly/LaunchToken.ts`: implement `claimCreatorFees()` — verify `Blockchain.tx.sender == deployer`; read creatorFeePool; set to zero; return amount via BytesWriter; emit FeeClaimedEvent
- [x] T059 [US7] [P] Update frontend FeeBreakdown component (`frontend/src/components/shared/FeeBreakdown.tsx`): show flywheel tax as separate line item; show minter reward eligibility status on token detail page (eligible/not eligible/claimable); add "Claim Minter Reward" button calling contract `claimMinterReward()` via simulate → send pattern
- [x] T060 [US8] [P] Add creator fee claiming to frontend: on token detail page, if connected wallet is creator, show accumulated fees amount (from contract `getConfig()` or dedicated read); add "Claim Creator Fees" button calling contract `claimCreatorFees()` via simulate → send pattern

---

## Phase 9: US9+US10 — Profiles and Platform Stats (P3)

**Goal**: Creator profiles and landing page with real data.

- [x] T061 [US10] Wire landing page (`frontend/src/pages/HomePage.tsx`): replace mock stats with `GET /v1/stats` API call for PlatformStats component; replace mock recent tokens with `GET /v1/tokens?sort=newest&limit=6`; replace mock top tokens with `GET /v1/tokens?sort=volume24h&limit=6`
- [x] T062 [US9] Create profile route in `backend/src/routes/profile.ts`: `GET /v1/profile/:address/tokens` querying MongoDB tokens collection by creatorAddress, returning list of tokens with status and volume
- [x] T063 [US9] Wire profile page (`frontend/src/pages/ProfilePage.tsx`): replace mock profile data with `GET /v1/profile/:address/tokens` API call; for holdings tab, query token balances via contract `balanceOf()` for each token the user holds
- [x] T064 [US10] Create stats route in `backend/src/routes/stats.ts`: `GET /v1/stats` reading PlatformStats singleton from MongoDB; return totalTokens, totalGraduated, totalVolumeSats, totalTrades, lastBlockIndexed

---

## Phase 10: Polish

Cross-cutting concerns, deployment, and security.

- [x] T065 Mobile responsiveness audit: test all pages on 375px (iPhone SE), 390px (iPhone 14), 768px (iPad) viewports; fix any layout issues with Tailwind responsive classes; ensure tappable targets are >= 44px
- [x] T066 Create `CLAUDE.md` at project root with full-stack template per Vibecode Bible: contract build instructions, backend setup, frontend dev server, OPWallet testing on testnet, network config (regtest/testnet/mainnet), contract addresses per environment
- [x] T067 Backend Dockerfile: multi-stage build (build TypeScript → run node); expose PORT; healthcheck; create `docker-compose.yml` with backend + MongoDB services
- [x] T068 Frontend deployment config: verify `frontend/netlify.toml` is correct (SPA redirect); add `VITE_API_URL` and `VITE_WS_URL` as Netlify environment variables; build and deploy
- [x] T069 Security audit: verify SafeMath on all u256 operations in LaunchToken; verify no `signer` values in frontend code; verify MongoDB queries are parameterized; verify rate limiting is active; verify error responses don't leak stack traces; sanitize token metadata (name, description) to prevent XSS; **Bob MCP checks**: verify NO Buffer usage in contracts (Uint8Array only); verify all `@method()` have explicit params (no bare decorators); verify BytesWriter sizes match actual data; verify `super.callMethod()` in all default cases; verify `constant`/`payable` flags correct on all methods; verify no raw arithmetic on u256 (SafeMath only); run `opnet_opnet_audit` tool for full contract audit
- [x] T070 Bonding curve consistency verification: create `shared/constants/test-vectors.ts` with 10+ test cases; verify contract simulation (via SDK `call()`), backend BondingCurveSimulator, and frontend `lib/bonding-curve.ts` produce identical outputs for all test vectors

---

## Dependency Graph

```
Phase 1 (Setup: T001–T005) ──→ Phase 2 (Foundational: T006–T014)
                                        │
                                        ├──→ Phase 3 (US1 Token Creation: T015–T033)
                                        │         │
                                        │         └──→ Phase 4 (US2+3 Buy/Sell: T034–T040)
                                        │                   │
                                        │                   └──→ Phase 5 (US5 Real-Time: T041–T051)
                                        │                             │
                                        │                             ├──→ Phase 6 (US4 Discovery: T052–T053)
                                        │                             │
                                        │                             └──→ Phase 7 (US6 Graduation: T054–T056)
                                        │                                       │
                                        │                                       └──→ Phase 8 (US7+8 Rewards: T057–T060)
                                        │                                                 │
                                        │                                                 └──→ Phase 9 (US9+10 Stats: T061–T064)
                                        │                                                           │
                                        │                                                           └──→ Phase 10 (Polish: T065–T070)
```

## Summary

| Phase | User Stories | Tasks | Key Deliverable |
|-------|-------------|-------|-----------------|
| 1 Setup | — | T001–T005 (5) | Project scaffolding |
| 2 Foundational | — | T006–T014 (9) | Shared types, DB, server |
| 3 US1 | Token Creation (P1) | T015–T033 (19) | Deploy token on testnet |
| 4 US2+3 | Buy/Sell (P1) | T034–T040 (7) | Trade on bonding curve |
| 5 US5 | Real-Time UX (P1) | T041–T051 (11) | ~3s optimistic updates |
| 6 US4 | Discovery (P1) | T052–T053 (2) | Search/filter/sort |
| 7 US6 | Graduation (P2) | T054–T056 (3) | Auto-graduate at 6.9M sats |
| 8 US7+8 | Rewards+Fees (P2) | T057–T060 (4) | Minter rewards, creator fees |
| 9 US9+10 | Profiles+Stats (P3) | T061–T064 (4) | Profiles, landing stats |
| 10 Polish | — | T065–T070 (6) | Deploy, security, mobile |
| **Total** | **10 stories** | **70 tasks** | |

**MVP Scope**: Phases 1–4 (T001–T040, 40 tasks) = create token + buy/sell on testnet.
**Full P1 Scope**: Phases 1–6 (T001–T053, 53 tasks) = all P1 stories complete.

**Parallel opportunities**:
- T001–T005 (all setup tasks)
- T007–T009 (shared types)
- T015–T016 (contract libs) alongside T023 (backend simulator)
- T028–T031 (frontend services) after backend routes exist
- T059–T060 (reward UI components)

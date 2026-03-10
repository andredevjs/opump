# Feature Specification: OPump — Bitcoin-Native Token Launchpad

**Feature Branch**: `1-opump-launchpad`
**Created**: 2026-03-04
**Status**: Draft
**Constitution**: [`constitution.md`](./constitution.md)
**Build Framework**: [Vibecode Bible](https://vibecode.finance/bible) — OP_NET + Bob MCP + iterative shipping

## User Scenarios & Testing

### User Story 1 — Create and Launch a Token (Priority: P1)
As a token creator, I want to deploy a new token through a guided wizard so that I can launch a tradeable token on Bitcoin L1 without needing initial liquidity.

The creator opens the Launch page and completes a 6-step wizard:
1. **Details** — enters token name, symbol, description, and uploads an image
2. **Socials** — adds optional links (website, Twitter, Telegram, Discord, GitHub)
3. **Creator Allocation** — sets a founder allocation between 0–10% of total supply
4. **Community Airdrop** — optionally distributes 0.1–20% of supply to $MOTO holders (~8,200 addresses), MotoCAT NFT holders (~2,800 addresses), or a custom address list
5. **Flywheel Tax** — optionally configures a buy fee (0–3%) and sell fee (0–5%) routed to burn, community pool, or creator wallet
6. **Deploy** — reviews summary and submits to OPNet; token is live immediately

**Why this priority**: Token creation is the foundational action — without it, there is nothing to trade.
**Independent Test**: A creator completes the wizard and the deployed token appears in the Trenches discovery page.
**Acceptance Scenarios**:
1. **Given** a connected wallet, **When** the creator completes all 6 steps and submits, **Then** the token is deployed on OPNet and appears in the token list within one confirmed block.
2. **Given** step 1 is incomplete (missing name or symbol), **When** the creator tries to advance, **Then** the wizard shows a validation error and prevents progression.
3. **Given** a creator allocation of 10%, **When** the token deploys, **Then** 10% of supply is minted to the creator's wallet and the remaining 90% backs the bonding curve.
4. **Given** a community airdrop targeting $MOTO holders at 5%, **When** the token deploys, **Then** 5% of supply is distributed proportionally to the ~8,200 $MOTO holder addresses.

---

### User Story 2 — Buy Tokens on the Bonding Curve (Priority: P1)
As a trader, I want to buy a token by sending BTC to the bonding curve so that I receive tokens at a deterministic price with no slippage surprises.

The trader navigates to a token's detail page, enters a BTC amount, sees a simulation of the expected token output (including fees and price impact), and confirms the buy. The trade uses a constant-product AMM (`k = virtualBTC * virtualTokens`).

**Why this priority**: Buying is the core trading action and primary revenue driver for the platform.
**Independent Test**: A trader buys tokens and sees the correct amount credited, with the bonding curve price moving accordingly.
**Acceptance Scenarios**:
1. **Given** a token with known reserves, **When** a trader enters a BTC amount, **Then** the UI shows the exact token output, 1.5% fee breakdown (1% platform, 0.25% creator, 0.25% minter pool), and price impact percentage.
2. **Given** a buy transaction is broadcast, **When** it appears in the mempool (~1–3 seconds), **Then** all connected clients see an optimistic price update with a pending indicator.
3. **Given** a buy transaction is confirmed in a block, **When** the indexer processes it, **Then** the pending indicator is removed and the trade appears in the confirmed trade history.

---

### User Story 3 — Sell Tokens Back to the Curve (Priority: P1)
As a trader, I want to sell my tokens back to the bonding curve so that I receive BTC at the current curve price.

The trader enters a token amount on the sell panel, sees a simulation of BTC output (after fees), and confirms the sell.

**Why this priority**: Selling completes the two-sided market and is essential for trader confidence.
**Independent Test**: A trader who previously bought tokens sells them and receives the correct BTC amount.
**Acceptance Scenarios**:
1. **Given** a trader holds tokens, **When** they enter a sell amount, **Then** the UI shows the exact BTC output after the 1.5% fee.
2. **Given** insufficient token balance, **When** the trader tries to sell more than they hold, **Then** the UI prevents submission and shows an error.

---

### User Story 4 — Discover Tokens in the Trenches (Priority: P1)
As a trader, I want to browse, search, and filter tokens so that I can find interesting tokens to trade.

The Trenches page shows a paginated list of all launched tokens with search by name/symbol, filter by status (active/graduated), and sort by volume, price, or market cap.

**Why this priority**: Discovery is the gateway to trading — traders need to find tokens before they can buy them.
**Independent Test**: A user opens Trenches, searches for a token by name, filters by active status, sorts by volume, and navigates to a token detail page.
**Acceptance Scenarios**:
1. **Given** 50+ launched tokens, **When** a user searches "MOTO", **Then** only tokens matching "MOTO" in name or symbol are displayed.
2. **Given** mixed active and graduated tokens, **When** a user filters by "Active", **Then** only tokens still on the bonding curve are shown.
3. **Given** the token list, **When** a user sorts by 24h volume descending, **Then** the highest-volume tokens appear first.

---

### User Story 5 — Real-Time Optimistic Trading UX (Priority: P1)
As a trader, I want to see trades reflected in the price within seconds (not 10 minutes) so that the platform feels responsive despite Bitcoin's block time.

The system implements a 3-layer optimistic UX:
1. **Broadcast** (~0s) — user signs and broadcasts, UI shows a spinner
2. **Mempool** (~1–3s) — pending tx detected, price updates optimistically for all clients via WebSocket, displayed with a "~" prefix
3. **Confirmed** (~10 min) — trade confirmed in a block, pending indicator removed

**Why this priority**: Without optimistic UX, Bitcoin's 10-minute block time makes the platform unusable for active trading.
**Independent Test**: User A buys a token; User B (on a different session) sees the price update within 3 seconds.
**Acceptance Scenarios**:
1. **Given** User A broadcasts a buy, **When** the mempool service detects it, **Then** all subscribed clients receive a WebSocket price update within 3 seconds.
2. **Given** an optimistic price is displayed, **When** the block confirms the trade, **Then** the price display transitions from optimistic ("~") to confirmed.
3. **Given** a pending transaction is dropped from the mempool (RBF or low fee), **When** the system detects the drop, **Then** the optimistic state rolls back and clients are notified.

---

### User Story 6 — Token Graduation to DEX (Priority: P2)
As a token holder, I want my token to automatically graduate to a full DEX pool when the bonding curve fills so that liquidity deepens and trading continues on MotoSwap.

When a token's real BTC reserve reaches 6.9M sats (~$69k), the system triggers graduation: liquidity migrates from the bonding curve to a MotoSwap DEX pool.

**Why this priority**: Graduation is the end-goal of the bonding curve phase, but trading can function without it initially.
**Independent Test**: A token reaches the graduation threshold and its liquidity appears on MotoSwap.
**Acceptance Scenarios**:
1. **Given** a token's real BTC reserve reaches 6.9M sats, **When** the next trade pushes it over the threshold, **Then** graduation is triggered and a MotoSwap liquidity pool is created.
2. **Given** a graduated token, **When** a user visits its detail page, **Then** they see a "Graduated" badge and a link to trade on MotoSwap.
3. **Given** a graduated token, **When** a user attempts to buy via the bonding curve, **Then** the system prevents the trade and directs them to MotoSwap.

---

### User Story 7 — Earn Minter Rewards (Priority: P2)
As an early buyer, I want to earn a share of trading fees by holding my tokens for 30 days so that I am rewarded for early support.

Buyers who purchase within the first 4,320 blocks (~30 days) of a token's launch AND hold for an additional 4,320 blocks become eligible to claim a proportional share of the 0.25% minter fee pool. This creates a symmetric model: 30-day buy window + 30-day hold requirement.

**Why this priority**: Minter rewards incentivize early participation and long-term holding, but the core trading loop works without them.
**Independent Test**: An early buyer holds for 30 days and successfully claims their minter reward share.
**Acceptance Scenarios**:
1. **Given** a buyer purchases tokens in the first N blocks, **When** 4,320 blocks pass and fees have accumulated, **Then** the buyer can claim their proportional share of the minter pool.
2. **Given** a buyer who sold before the 30-day hold period, **When** they try to claim minter rewards, **Then** the system denies the claim.

---

### User Story 8 — Claim Creator Fees (Priority: P2)
As a token creator, I want to claim my share of trading fees so that I have ongoing revenue from my token.

Creators earn 0.25% of all trading volume on their token and can claim accumulated fees at any time via `claimCreatorFees()`.

**Why this priority**: Creator sustainability is a differentiator, but launch and trading must work first.
**Independent Test**: A creator's token generates trading volume; the creator claims fees and receives BTC.
**Acceptance Scenarios**:
1. **Given** accumulated creator fees from trading activity, **When** the creator calls claim, **Then** they receive the correct BTC amount.
2. **Given** no trading activity since last claim, **When** the creator tries to claim, **Then** the system indicates no fees are available.

---

### User Story 9 — View Creator Profile (Priority: P3)
As a user, I want to view a creator's profile showing their launched tokens and holdings so that I can assess their track record.

**Why this priority**: Profile pages add trust and transparency but are not required for core functionality.
**Independent Test**: A user navigates to a creator's profile and sees their launched tokens listed.
**Acceptance Scenarios**:
1. **Given** a creator has launched 3 tokens, **When** a user visits their profile, **Then** all 3 tokens are listed with current status and volume.

---

### User Story 10 — Landing Page with Platform Stats (Priority: P3)
As a visitor, I want to see platform-level stats on the home page so that I can gauge OPump's activity and traction.

The home page displays total tokens launched, total graduated, recent tokens, and aggregate volume.

**Why this priority**: Provides social proof and an entry point, but not needed for core trading.
**Independent Test**: A visitor opens the home page and sees accurate stats reflecting actual platform data.
**Acceptance Scenarios**:
1. **Given** 100 tokens launched and 5 graduated, **When** a visitor loads the home page, **Then** they see "100 tokens launched" and "5 graduated" (or equivalent).

---

### Edge Cases
- What happens when two users try to buy at exactly the same time? The reservation system locks the price for the first user; the second user gets the post-trade price.
- What happens if a pending transaction is replaced via RBF? Optimistic state rolls back and affected clients are notified.
- What happens if the bonding curve reaches graduation mid-trade? The trade that crosses the threshold triggers graduation; subsequent bonding curve trades are rejected.
- What happens if the creator sets both max creator allocation (10%) AND max airdrop (20%)? The system enforces a **25% combined cap** (creator allocation + airdrop ≤ 25%). This ensures at least 75% of supply backs the bonding curve, keeping slippage reasonable. Example valid configurations: 10% creator + 15% airdrop, 5% creator + 20% airdrop, 0% creator + 20% airdrop (within cap).
- What happens if no one buys within the airdrop community lists and the token has 0 trading volume? The token remains active on the bonding curve indefinitely; there is no expiry or delisting mechanism.

## Requirements

### Functional Requirements

**Token Creation**
- **FR-001**: System MUST allow a connected wallet to create a new token through a 6-step wizard (details, socials, creator allocation, community airdrop, flywheel tax, deploy).
- **FR-002**: System MUST validate all required fields (name, symbol) before allowing deployment.
- **FR-003**: System MUST support creator allocation of 0–10% of token supply.
- **FR-004**: System MUST support community airdrops to $MOTO holders, MotoCAT NFT holders, or custom address lists at 0.1–20% of supply.
- **FR-004a**: System MUST enforce a combined cap of 25% for creator allocation + community airdrop. The wizard MUST validate this constraint and show remaining allocation budget dynamically.
- **FR-005**: System MUST support configurable flywheel tax with buy fee (0–3%) and sell fee (0–5%) routable to burn, community pool, or creator wallet.

**Trading**
- **FR-006**: System MUST implement a constant-product AMM bonding curve (`k = virtualBTC * virtualTokens`) with initial virtual reserves of 30 BTC and 1 billion tokens.
- **FR-007**: System MUST charge a 1.5% trading fee split as: 1% platform, 0.25% creator, 0.25% minter pool.
- **FR-008**: System MUST provide buy and sell simulation endpoints showing exact output, fees, and price impact before trade execution.
- **FR-009**: System MUST prevent trades on graduated tokens and redirect users to MotoSwap.
- **FR-009a**: System MUST enforce a minimum trade amount of 10,000 sats (~$1) for both buys and sells, validated in the smart contract and the UI. Trades below this threshold are rejected with a clear error message.
- **FR-009b**: System MUST implement a price reservation system for the two-transaction model. When a user initiates a buy/sell, the current curve price is locked for that user for **3 blocks (~30 minutes)**. If the reservation expires without completion, the lock is released and a slashing penalty applies (50% for normal cancellation, escalating to 90% for repeated squatting). Other traders see reserved amounts and can calculate the next available price.

**Real-Time UX**
- **FR-010**: System MUST detect pending transactions in the mempool and push optimistic price updates to all subscribed clients via WebSocket within 3 seconds.
- **FR-011**: System MUST reconcile optimistic state with confirmed state when blocks are mined.
- **FR-012**: System MUST roll back optimistic state when pending transactions are dropped from the mempool.

**Discovery**
- **FR-013**: System MUST provide a paginated token listing with search (by name/symbol), filter (by active/graduated status), and sort (by volume, price, market cap).

**Graduation**
- **FR-014**: System MUST trigger automatic graduation when a token's real BTC reserve reaches 6.9M sats.
- **FR-015**: System MUST migrate liquidity to MotoSwap DEX upon graduation.

**Rewards & Fees**
- **FR-016**: System MUST track minter eligibility for buyers who purchase within the first 4,320 blocks (~30 days) of token launch. Eligible minters must hold for an additional 4,320 blocks before claiming their proportional share of the 0.25% minter fee pool.
- **FR-017**: System MUST allow creators to claim their accumulated 0.25% trading fees at any time.

**Profiles & Stats**
- **FR-018**: System MUST display a creator profile showing launched tokens and holdings.
- **FR-019**: System MUST display platform-level stats (total tokens launched, total graduated, aggregate volume).

### Key Entities (if data involved)

- **Token**: A launched asset with metadata (name, symbol, description, image URL, socials), bonding curve state (virtual reserves, k constant), configuration (creator allocation, airdrop settings, flywheel tax), and lifecycle status (active, graduated). Token images are uploaded via the wizard and stored on a centralized CDN (S3 or equivalent); the image URL is stored in MongoDB alongside token metadata.
- **Trade**: A buy or sell event associated with a token, including BTC amount, token amount, fee breakdown, trader address, timestamp, and confirmation status (pending/confirmed).
- **Creator**: A wallet address that launched one or more tokens, with accumulated claimable fees.
- **Minter**: An early buyer of a token, tracked for eligibility in the minter reward program based on purchase block and hold duration.
- **Airdrop Distribution**: A mapping of recipient addresses and their allocated token amounts for a given token's community airdrop.

## Success Criteria

### Measurable Outcomes
- **SC-001**: A token can be created and become tradeable within one confirmed block of deployment.
- **SC-002**: Trade simulations match actual on-chain execution within 0.01% variance (accounting for concurrent trades).
- **SC-003**: Optimistic price updates reach all subscribed clients within 3 seconds of mempool detection.
- **SC-004**: Confirmed state reconciliation occurs within 5 seconds of block indexing, with zero permanent state drift.
- **SC-005**: Graduation triggers correctly at the 6.9M sat threshold with zero missed graduations.
- **SC-006**: Creator fee claims return the exact accumulated amount with no rounding loss beyond 1 satoshi.
- **SC-007**: Minter rewards are distributed proportionally to eligible holders with verified 4,320-block hold periods.
- **SC-008**: Token discovery search returns relevant results within 500ms for a catalog of 1,000+ tokens.

## Build Strategy (Vibecode Bible Alignment)

Per the Bible's iterative shipping principle and the constitution's phase plan:

| Phase | Scope | Ship Gate |
|-------|-------|-----------|
| **1 — Core Loop** | Token creation wizard + buy/sell on bonding curve + basic token list | A user can create a token and trade it on testnet |
| **2 — UX Layer** | Optimistic mempool UX + WebSocket real-time + trade simulation panel | Trades feel instant (~3s feedback) despite 10-min blocks |
| **3 — Discovery** | Trenches page (search/filter/sort) + landing page with stats | Users can find tokens without knowing the address |
| **4 — Rewards** | Minter rewards + creator fee claiming + flywheel tax routing | Creators and early buyers earn revenue |
| **5 — Graduation** | Auto-graduation at 6.9M sats + MotoSwap liquidity migration | Tokens transition to full DEX trading |
| **6 — Polish** | Creator profiles + animations + mobile optimization + deployment (IPFS/Vercel) | Production-ready for mainnet |

**Key Bible rules enforced:**
- Build order: contracts → backend → frontend (always)
- HyperExpress backend (Express is forbidden)
- AssemblyScript contracts with SafeMath, no unbounded loops
- OPWallet integration with mandatory WalletConnect modal CSS fix
- Dark theme with orange/amber accents
- Simulate every trade before sending (client-side + API endpoint)
- Testnet-first development using `faucet.opnet.org`
- Bob (OP_NET MCP) as primary resource for contract/SDK questions

## Assumptions
- Users have the OPWallet browser extension installed and connected.
- An OPNet RPC node is accessible for all blockchain interactions.
- $MOTO holder and MotoCAT NFT holder address lists are available as snapshots at token launch time.
- MotoSwap DEX is operational and accepts programmatic liquidity pool creation for graduation.
- Bob (OP_NET MCP) is available via `claude mcp add opnet-bob --transport http https://ai.opnet.org/mcp`.
- Development begins on testnet with zero financial risk.

## Clarifications

### Session 2026-03-04
- Q: What is the maximum combined creator allocation + community airdrop? → A: **25% combined cap**. Creator 0–10% + Airdrop 0–15% (wizard validates dynamically). Ensures ≥75% of supply backs the bonding curve.
- Q: What defines an "early buyer" eligible for minter rewards? → A: **Buyers within the first 4,320 blocks (~30 days) of token launch**. Must then hold for an additional 4,320 blocks before claiming. Symmetric 30-day buy window + 30-day hold.
- Q: Where are token images stored? → A: **Centralized CDN (S3 or equivalent)**. Image uploaded in wizard, URL stored in MongoDB. Can migrate to IPFS later if needed.
- Q: Should there be minimum trade amounts? → A: **10,000 sats (~$1) minimum** for both buys and sells. Enforced in contract and UI. Prevents dust spam.
- Q: How long should a price reservation last? → A: **3 blocks (~30 minutes)**. Slashing penalty on expiry: 50% normal cancellation, escalating to 90% for repeated squatting.

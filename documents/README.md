# OPLaunch

A Bitcoin-native token launchpad built on [OPNet](https://opnet.org), inspired by platforms like [radFi](https://app.radfi.co/). OPLaunch enables zero-friction token creation with bonding curve mechanics, community airdrops, creator monetization, and automatic graduation to DEX liquidity.

## How It Works

1. **Launch** — Creators deploy a token through a guided wizard. Configure name, symbol, socials, creator allocation (0–10%), community airdrops, and flywheel tax settings.
2. **Trade** — Tokens are instantly tradeable on an automated bonding curve (constant-product AMM, `x * y = k`). No initial liquidity needed.
3. **Graduate** — When a token's real BTC reserve hits **6.9M sats (~$69k)**, it graduates and migrates liquidity to MotoSwap DEX.

## Architecture

```
oplaunch/
├── frontend/    # React SPA — token discovery, trading UI, launch wizard
├── backend/     # Node.js API — indexer, mempool, WebSocket, REST
└── contracts/   # AssemblyScript smart contracts — bonding curve, factory
```

### Frontend

React 18 + TypeScript + Vite + Tailwind CSS.

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Landing page with platform stats and recent tokens |
| Launch | `/launch` | 6-step token creation wizard |
| Trenches | `/trenches` | Token discovery with search, filters, sorting |
| Token | `/token/:addr` | Token detail — chart, trades, buy/sell panel |
| Profile | `/profile/:addr` | Creator profile — launched tokens, holdings |

**Key features:**
- OP_WALLET integration for Bitcoin signing
- Real-time WebSocket price updates and trade feed
- Optimistic mempool UX — instant trade feedback before confirmation
- Client-side bonding curve simulation (price impact, slippage)
- TradingView lightweight charts

### Backend

Node.js + HyperExpress + MongoDB + WebSocket.

**REST API** (`/v1`):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tokens` | GET | List tokens (paginated, filterable, sortable) |
| `/tokens/:addr` | GET | Token details with reserves and pricing |
| `/tokens/:addr/trades` | GET | Trade history |
| `/simulate/buy` | POST | Simulate buy — output, fees, price impact |
| `/simulate/sell` | POST | Simulate sell |
| `/stats` | GET | Platform stats (total tokens, graduated count) |
| `/profile/:addr/tokens` | GET | Tokens created by address |

**WebSocket** (`ws://host/ws`):

Channels: `token:price`, `token:trades`, `token:pending`, `platform:newtoken`, `platform:graduation`, `block`

**Services:**
- **IndexerService** — Polls OPNet RPC for new blocks, indexes confirmed trades into MongoDB
- **MempoolService** — Polls mempool for pending transactions (800ms interval)
- **OptimisticStateService** — Applies pending trades to confirmed reserves for instant price estimates
- **BondingCurveSimulator** — Mirrors on-chain AMM math for accurate trade simulations

### Contracts

AssemblyScript compiled to WASM, deployed on OPNet (Bitcoin).

**LaunchToken** — Individual bonding curve token:
- Constant-product AMM (`k = virtualBtc * virtualToken`)
- Initial virtual reserves: 30 BTC / 1B tokens
- 1.5% trading fee split: 1% platform, 0.25% creator, 0.25% minter rewards
- Graduation triggers at configurable BTC threshold
- Minter reward program — early buyers earn proportional share of fee pool after 30-day hold
- Creator allocation and fee claiming

**OPLaunchFactory** — Registry and analytics:
- Token registration and paginated retrieval
- Graduation tracking and volume accumulation
- Admin controls for threshold and fee recipient

## Bonding Curve

Tokens use a constant-product AMM with virtual reserves:

```
k = virtualBtcReserve * virtualTokenSupply

Buy:  tokensOut = virtualTokenSupply - (k / (virtualBtcReserve + btcIn))
Sell: btcOut    = virtualBtcReserve  - (k / (virtualTokenSupply + tokensIn))
```

| Parameter | Value |
|-----------|-------|
| Initial virtual BTC | 30 BTC (3,000,000,000 sats) |
| Total token supply | 1,000,000,000 (8 decimals) |
| Trading fee | 1.5% |
| Graduation threshold | 6.9M sats (~$69k) |
| Minter hold period | 4,320 blocks (~30 days) |
| Max creator allocation | 10% |

## Fee Structure

| Recipient | Share | Description |
|-----------|-------|-------------|
| Platform | 1.00% | Protocol revenue |
| Creator | 0.25% | Claimable by token creator |
| Minters | 0.25% | Pool distributed to early buyers after hold period |

## Launch Features

- **Community Airdrops** — Distribute tokens to predefined communities ($MOTO holders, MotoCAT ordinal holders) or custom address lists (0.1–20% allocation)
- **Flywheel Tax** — Configurable buy (0–3%) and sell (0–5%) fees routed to burn, community pool, or creator wallet
- **Creator Allocation** — Reserve 0–10% of token supply for the creator
- **Minter Rewards** — Early buyers accumulate shares in a fee pool, claimable after 30-day hold

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB
- OPNet node (or access to RPC endpoint)
- OP_WALLET browser extension

### Backend

```bash
cd backend
npm install
cp .env.example .env  # Configure environment variables
npm run dev
```

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP/WS server port |
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection |
| `MONGO_DB_NAME` | `oplaunch` | Database name |
| `OPNET_RPC_URL` | `http://localhost:9001` | OPNet RPC endpoint |
| `NETWORK` | `regtest` | `regtest` or `mainnet` |
| `FACTORY_ADDRESS` | — | Deployed factory contract address |
| `INDEXER_POLL_MS` | `5000` | Block polling interval |
| `MEMPOOL_POLL_MS` | `800` | Mempool polling interval |

### Contracts

```bash
cd contracts
npm install
npm run build:factory
npm run build:token
node scripts/deploy.mjs  # Deploy to regtest
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies API requests to the backend.

**Environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3000` | Backend API base URL |
| `VITE_WS_URL` | `ws://localhost:3000/ws` | WebSocket endpoint |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, HyperExpress, MongoDB |
| Contracts | AssemblyScript, btc-runtime (WASM) |
| Blockchain | Bitcoin via OPNet |
| Wallet | OP_WALLET browser extension |
| Charts | TradingView Lightweight Charts |
| Real-time | WebSocket (HyperExpress built-in) |
# opump

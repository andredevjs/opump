# What Is OPump

## The One-Liner

OPump is a Bitcoin-native OP20 token launchpad built on OPNet — anyone can create and trade OP20 tokens directly on Bitcoin L1 using a bonding curve, with no initial liquidity needed, no bridges, and no sidechains.

---

## What It Does

### For Token Creators

Launch an OP20 token in a 6-step wizard:

1. **Details** — name, symbol, description, image
2. **Socials** — website, Twitter, Telegram, Discord, GitHub
3. **Creator Allocation** — 0-10% of supply as founder tokens
4. **Community Airdrop** — distribute to $MOTO holders (~8,200 addresses), MotoCAT NFT holders (~2,800 addresses), or a custom address list (0.1-20% of supply)
5. **Flywheel Tax** — optional buy fee (0-3%) and sell fee (0-5%) routed to burn, community pool, or creator wallet
6. **Deploy** — submit to OPNet, token is live immediately

No liquidity required. The bonding curve *is* the market maker from block one.

### For Traders

- Browse OP20 tokens in the "Trenches" discovery page (search, filter by active/graduated, sort by volume/price/market cap)
- Buy OP20 tokens by sending BTC to the bonding curve — constant-product AMM (`k = virtualBTC * virtualTokens`)
- Sell OP20 tokens back to the curve at any time
- See trades within ~1 second via mempool optimistic updates, confirmed in ~10 minutes
- Earn **minter rewards**: early buyers who hold for 30 days claim a share of 0.25% of all trading fees

### Graduation to DEX

When an OP20 token accumulates **6.9M sats (~$69k) in real BTC reserve**, it graduates to MotoSwap DEX with automatic liquidity migration. Trading moves from bonding curve to a full DEX pool.

---

## How It Works Under the Hood

### Architecture

```
frontend/   → React 18 SPA (Vite, Tailwind, TypeScript, OP_WALLET integration)
backend/    → Node.js API + indexer + mempool watcher (HyperExpress, MongoDB)
contracts/  → AssemblyScript smart contracts (LaunchToken + OPumpFactory)
```

### The Bonding Curve

Constant-product AMM with virtual reserves:

- **Initial state**: 30 BTC virtual reserve, 1 billion token supply
- **k = 3,000,000,000 * 100,000,000,000,000,000** (constant maintained across all trades)
- **Buy**: `tokensOut = virtualTokenSupply - (k / (virtualBtcReserve + btcIn))`
- **Sell**: `btcOut = virtualBtcReserve - (k / (virtualTokenSupply + tokensIn))`

Three identical implementations (contract, backend simulator, frontend simulator) ensure price consistency across the stack.

### Fee Structure (1.5% per trade)

| Recipient | Share | Mechanism |
|-----------|-------|-----------|
| Platform | 1.0% | Protocol treasury |
| Creator | 0.25% | Claimable via `claimCreatorFees()` |
| Minter Pool | 0.25% | Distributed to early buyers after 30-day hold |

### The 3-Layer Optimistic UX

This is what makes a 10-minute block time feel instant:

1. **Broadcast layer** (~0s) — user signs and broadcasts, frontend shows spinner
2. **Mempool layer** (~1-3s) — MempoolService detects the pending tx, OptimisticStateService simulates the trade, WebSocket pushes updated price to all clients with "~" prefix
3. **Confirmed layer** (~10 min) — IndexerService detects the trade in a mined block, MongoDB stores the trade, UI removes pending indicator

Users see their trade reflected in the price within seconds. Confirmation follows naturally.

### Backend Services

- **IndexerService** — polls blocks every 5 seconds for confirmed trades
- **MempoolService** — polls mempool every 800ms for pending transactions
- **OptimisticStateService** — simulates pending trades on top of confirmed reserves for instant UX
- **WebSocketServer** — bridges all events to subscribed clients in real-time

### API Surface

| Endpoint | Purpose |
|----------|---------|
| `GET /v1/tokens` | List tokens (paginated, filterable, sortable) |
| `GET /v1/tokens/:addr` | Token detail (metadata, reserves, price, graduation status) |
| `GET /v1/tokens/:addr/trades` | Trade history (confirmed + pending) |
| `GET /v1/tokens/:addr/price` | Current price and reserves |
| `POST /v1/simulate/buy` | Simulate a buy (returns output, fee, price impact) |
| `POST /v1/simulate/sell` | Simulate a sell |
| `GET /v1/stats` | Platform stats (total launched, total graduated) |
| `GET /v1/profile/:addr/tokens` | Tokens created by an address |
| `WS /ws` | Real-time subscriptions (price, trades, pending, graduation, blocks) |

---

## Why It Matters for Bitcoin L1

### 1. Bitcoin Can Do DeFi Natively

The narrative has always been "Bitcoin is just a store of value, you need Ethereum/Solana for DeFi." OPump is a working counterexample — a fully functional OP20 token AMM launchpad running on Bitcoin L1. Every trade settles on Bitcoin. No L2, no sidechain, no bridge.

### 2. Bitcoin Holders Can Finally Participate

Bitcoin has the largest holder base in crypto, but they've been locked out of the OP20 token launch economy. To participate in pump.fun-style launches, they had to bridge to Solana or Ethereum. OPump means they stay in the Bitcoin ecosystem — their BTC never leaves L1.

### 3. It's Structurally Fairer Than Solana Alternatives

This isn't marketing. It's architecture:

| Problem on Solana/Ethereum | How OPump Solves It |
|---|---|
| Bots snipe tokens in the same block as deploy | 10-minute blocks give humans time to see and react |
| Sandwich attacks extract value from every trade | Reservation system locks price — no sandwiching possible |
| MEV bots front-run via priority fees | Mempool visibility + reservation = the price you see is the price you get |
| Speed favors bots, humans always lose | Slower pace levels the playing field |
| Token launches are PvP arenas | Minter rewards + airdrops create aligned communities |

### 4. It Builds on Bitcoin's Existing Communities

The built-in airdrop system targets people who are already here — $MOTO holders, MotoCAT ordinal collectors, custom Bitcoin-native communities. This isn't importing Solana degen culture to Bitcoin. It's building token infrastructure for Bitcoin's own ecosystem.

### 5. Creator Sustainability Beyond Launch Day

Most launchpads give creators a one-time allocation and nothing else. OPump gives creators three revenue streams:

- **Founder allocation** (0-10% of supply)
- **Creator fees** (0.25% of all trading volume, claimable)
- **Flywheel tax** (optional additional buy/sell fee routed however they choose)

This means creators have ongoing incentive to build around their token, not just launch and abandon.

### 6. It Proves OPNet's Capabilities

OPump is a complex, multi-contract application (factory + individual bonding curve tokens) with real DeFi mechanics — AMM pricing, fee distribution, graduation triggers, minter reward vesting. It demonstrates that OPNet can support the same sophistication as EVM chains while running natively on Bitcoin's security model.

---

## The Pitch

**Pump.fun is fast. OPump is fair.**

Bitcoin users don't need sub-second finality to launch OP20 tokens. They need a platform where:

- The rules are transparent (bonding curve math is deterministic)
- Bots don't win by default (10-minute blocks + reservations)
- Early supporters are rewarded (minter rewards for 30-day holders)
- Creators have sustainable revenue (fees + flywheel tax)
- Everything settles on the most secure blockchain in existence

OPump is what pump.fun would look like if it was built for Bitcoin OP20 tokens from day one — slower by design, fairer by architecture, native to the chain with the most value.

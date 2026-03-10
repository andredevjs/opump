# OPump Project Constitution

**Project**: OPump — Bitcoin-Native Token Launchpad
**Created**: 2026-03-04
**Source of Truth**: [Vibecode Bible](https://vibecode.finance/bible) + OPump domain documents

This constitution governs all specs, plans, and code produced for OPump. Every implementation decision must be traceable to a principle below.

---

## 1. Core Philosophy

### 1.1 Ship Over Perfect
- **Start small, ship fast, iterate.** A working single feature beats a broken ambitious attempt.
- Follow the Bible's progressive approach: Message 1 builds the core, Message 2 adds a layer, Message 3 polishes.
- "Winners ship. Not technically brilliant — shipped."
- Every PR must leave the app in a deployable state.

### 1.2 Fairness Over Speed
- OPump's differentiator is **fairness, not speed**. Bitcoin's 10-minute block time is a feature, not a bug.
- Reservation-based price locking eliminates sandwich attacks and front-running.
- The optimistic mempool UX makes it *feel* fast without compromising fairness guarantees.
- Never sacrifice MEV protection for perceived performance.

### 1.3 Bitcoin-Native, No Shortcuts
- Everything settles on Bitcoin L1. No bridges, no sidechains, no L2s.
- The bonding curve IS the market maker — no external liquidity required.
- Respect the two-transaction model (funding TX + interaction TX) and build robust reservation logic around it.

---

## 2. Architecture Mandates

### 2.1 Three-Layer Stack

```
contracts/   → AssemblyScript smart contracts (WASM on OPNet)
backend/     → Node.js API + indexer + mempool watcher
frontend/    → React SPA with OPWallet integration
```

**Build order is always: contracts → backend → frontend.**

### 2.2 Smart Contracts (AssemblyScript)

| Rule | Detail |
|------|--------|
| Language | AssemblyScript compiled to WASM via `btc-runtime` |
| Math | `u256` arithmetic only. No floating point. Use SafeMath for all operations. |
| Loops | **No unbounded loops.** All iterations must have a known upper bound. |
| Storage | 65,535 pointers per contract with `u256` sub-pointers. Plan pointer allocation upfront. |
| Access control | Owner/admin patterns for privileged operations (fee changes, graduation thresholds). |
| Testing | Simulate every transaction before sending to chain. |
| Deployment | Testnet first, always. Mainnet only after testnet validation. |

### 2.3 Backend (Node.js)

| Rule | Detail |
|------|--------|
| HTTP framework | **HyperExpress only.** Express is forbidden (per Vibecode Bible). |
| Database | MongoDB for indexed data (trades, tokens, stats). |
| Real-time | WebSocket via HyperExpress built-in. No Socket.IO. |
| Network config | Support `regtest`, `testnet`, and `mainnet` via environment variable. |
| Blockchain queries | Use `JSONRPCProvider` from OP_NET SDK for all RPC calls. |
| Polling | IndexerService: 5s block polling. MempoolService: 800ms mempool polling. |

### 2.4 Frontend (React)

| Rule | Detail |
|------|--------|
| Stack | React 18 + TypeScript + Vite + Tailwind CSS |
| Wallet | OPWallet integration via `@aspect-build/opnet-wallet-connector` |
| CSS fix | WalletConnect modal CSS fix is **mandatory** (per Bible Full-Stack template) |
| Theme | Dark theme with orange/amber accents (Bitcoin aesthetic) |
| Charts | TradingView Lightweight Charts for price/volume |
| Simulation | Always simulate trades client-side before sending. Show exact output, fees, price impact. |
| Addresses | Truncate display addresses: `bc1q...x4f2` pattern |
| Optimistic UX | 3-state model: Broadcast → Mempool → Confirmed. Pending trades shown with "~" prefix. |

### 2.5 Shared Conventions

| Rule | Detail |
|------|--------|
| Language | TypeScript everywhere (frontend, backend, shared types) |
| Types | Shared types directory for entities used across layers |
| Bonding curve | Three identical implementations (contract, backend simulator, frontend simulator) must produce identical results |
| Environment | `.env` files per layer, never committed. `.env.example` templates provided. |
| API versioning | All REST endpoints under `/v1` prefix |

---

## 3. Development Principles

### 3.1 Iterative Build Phases
Per the Vibecode Bible, build progressively:

1. **Phase 1 — Core Loop**: Deploy token + buy/sell on bonding curve + basic token list. This is the MVP.
2. **Phase 2 — UX Layer**: Optimistic mempool UX, WebSocket real-time updates, trade simulation.
3. **Phase 3 — Discovery**: Trenches page with search/filter/sort, landing page with stats.
4. **Phase 4 — Rewards**: Minter rewards, creator fee claiming, flywheel tax routing.
5. **Phase 5 — Graduation**: Auto-graduation to MotoSwap, liquidity migration.
6. **Phase 6 — Polish**: Creator profiles, animations, mobile optimization, deployment.

Each phase must be shippable. No phase depends on a later phase.

### 3.2 Error Handling
- Paste errors to Bob (OP_NET MCP) for contract-specific issues.
- When something is 80% right, fix the 20% — don't restart.
- Use the "nuclear option" (rebuild a single component cleanly) only after 3 failed fix attempts.

### 3.3 Testnet-First
- All development and testing happens on testnet with test Bitcoin.
- Use OPNet faucet (`faucet.opnet.org`) for test funds.
- Mainnet deployment is a separate, deliberate step after full testnet validation.

---

## 4. Security Non-Negotiables

### 4.1 Smart Contract Security
- **Reservation system**: Price locking at reserve time to prevent front-running.
- **Slashing penalties**: 50% immediate cancel penalty, escalating to 90% for squatting (per feasibility doc).
- **UTXO locking**: Reservations lock UTXOs to prevent double-reservation attacks.
- **Rate limiting**: Prevent reservation spam.
- **Overflow protection**: SafeMath on all `u256` operations.

### 4.2 Frontend Security
- No private keys in frontend code, ever.
- All signing happens in OPWallet — the app never touches keys.
- Validate all user inputs before sending to backend or chain.
- Sanitize token metadata (name, description, image URLs) to prevent XSS.

### 4.3 Backend Security
- Validate all incoming API parameters.
- Rate-limit public endpoints.
- No secrets in code — environment variables only.
- MongoDB queries must be parameterized (no injection).

---

## 5. UX Principles

### 5.1 Make Bitcoin Feel Fast
The 3-layer optimistic UX is not optional — it is the core UX innovation:

| State | Timing | User Sees |
|-------|--------|-----------|
| Broadcasted | ~0s | Spinner / "Submitting..." |
| In Mempool | ~1-3s | Trade in activity feed, price updates with "~" prefix |
| Confirmed | ~10 min | Green badge, "~" removed, final state |

### 5.2 Transparency Over Abstraction
- Show the trade queue — users see what's coming.
- Show fee breakdowns explicitly (1% platform, 0.25% creator, 0.25% minters).
- Show price impact before execution.
- Show reservation status and expiry.
- Never hide the fact that this is Bitcoin with 10-minute blocks.

### 5.3 Mobile-Ready
- ~50% of users will be on mobile (per Bible).
- Large tappable buttons, nothing cut off.
- Responsive layouts from day one.

---

## 6. Deployment & Distribution

### 6.1 Frontend Deployment
Two supported options (per Bible):
- **IPFS** — decentralized, aligns with Bitcoin philosophy (preferred)
- **Vercel/Netlify** — fast, free, simple URL

### 6.2 Backend Deployment
- Standard Node.js deployment (VPS, Docker, or cloud)
- MongoDB instance (Atlas or self-hosted)
- OPNet RPC endpoint access

### 6.3 Contract Deployment
- Deploy via OPNet CLI scripts
- Factory contract first, then tokens via factory
- Verify contract addresses in environment config

---

## 7. Bob (OP_NET MCP) Integration

Bob is the AI builder with specialized OP_NET knowledge. Use Bob for:
- Smart contract scaffolding and debugging
- OPNet SDK usage patterns
- OPWallet integration issues
- Contract deployment scripts
- Network-specific configuration

**MCP connection**: `claude mcp add opnet-bob --transport http https://ai.opnet.org/mcp`

When stuck on OP_NET-specific issues, consult Bob before searching the web.

---

## 8. Quality Gates

Before any feature is considered "done":

- [ ] Works on testnet with test Bitcoin
- [ ] Bonding curve math matches across all 3 implementations (contract/backend/frontend)
- [ ] Optimistic state reconciles correctly with confirmed state
- [ ] Mobile-responsive layout verified
- [ ] No console errors in browser
- [ ] API endpoints return correct data with proper error codes
- [ ] Dark theme applied consistently
- [ ] OPWallet connection/disconnection handled gracefully

---

## 9. What This Constitution Does NOT Cover

- Specific code patterns (see CLAUDE.md when created)
- Sprint planning or timelines
- Team roles or permissions
- Marketing or go-to-market strategy
- Tokenomics beyond what's in the spec

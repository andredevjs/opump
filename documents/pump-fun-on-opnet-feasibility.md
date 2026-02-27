# Building OPump: A pump.fun-Style Launchpad on OPNet

## Feasibility Assessment

### Is It Possible?

Yes. OPNet has all the primitives needed: OP20 tokens with `_mint`/`_burn`, storage for bonding curve state, factory contracts for deploying tokens, and the math capabilities for curve calculations.

But there are real challenges unique to Bitcoin L1 that make it meaningfully harder than building on Ethereum/Solana.

---

## What Works Well

### 1. OP20 Token Standard
Full `_mint`, `_burn`, `_transfer` support. You can mint tokens on buy and burn on sell, which is exactly what a bonding curve needs.

### 2. Token Factory
OPNet has factory contracts (`IOP20Factory`) that can deploy new tokens programmatically. Each launch can get its own token.

### 3. Storage
65,535 pointers per contract with `u256` sub-pointers is more than enough for bonding curve state (reserves, supply, curve parameters, per-user data).

### 4. Math
`u256` arithmetic in AssemblyScript gives you enough precision for bonding curve math (exponential, linear, or constant-product).

---

## The Hard Problems

### 1. Two-Transaction Model (The Big One)

On Ethereum/Solana, "send ETH, receive token" is atomic -- one transaction. On OPNet, contract interactions use a **two-transaction model**: a funding TX and an interaction TX. This means:

- A buy on the bonding curve is not atomic from the user's perspective
- There's a window between funding and execution where conditions can change
- You need a **reservation system** to lock the price between TX1 and TX2

### 2. Front-Running / MEV via Reservation Exploitation

This is OPNet's biggest DEX/AMM attack surface. The reservation window creates optionality for attackers:

- **Double-reservation**: Same UTXOs backing multiple reservations, executing only the profitable one
- **Expiry racing**: Reserve at a good price, wait, execute only if still favorable
- **Metadata leakage**: If reservation details are visible in the mempool, observers can front-run

Pump.fun relies on instant buys -- on OPNet you need robust reservation logic with slashing penalties for cancellation (audit guidelines suggest 50% immediate cancel penalty, escalating to 90% for squatting).

### 3. No Native BTC in Contracts

Ethereum AMMs hold ETH + tokens in the contract. OPNet contracts cannot directly hold BTC the same way. The BTC side of the bonding curve needs to be managed through UTXO accounting and the reservation/queue system, not a simple balance mapping. This makes the "send BTC, get tokens" flow more complex.

### 4. Block Time (~10 minutes)

Bitcoin blocks are ~10 minutes. Pump.fun on Solana has sub-second finality. This means:

- Bonding curve price updates are slow
- The "race to buy early" dynamic plays out over minutes/hours, not seconds
- Reservation windows need to account for slow confirmations
- UX requires optimistic updates (mempool-based) to feel responsive

### 5. Gas/Computation Limits

Every operation costs gas. Bonding curve math (especially exponential curves like `P = a * e^(bS)`) can be computationally expensive. You need to:

- Use efficient fixed-point math (no floating point in AssemblyScript contracts)
- Pre-compute where possible
- Keep curve formulas gas-efficient (linear or piecewise-linear curves are safer than exponential)

### 6. Graduation to DEX (Liquidity Migration)

Pump.fun "graduates" tokens to Raydium when the curve fills. On OPNet, this means:

- Programmatically creating a MotoSwap/NativeSwap pool
- Transferring the accumulated BTC and remaining tokens to the pool
- This cross-contract interaction adds complexity and needs to be atomic (or at least safe against partial execution)

---

## Mitigations

| Problem | Mitigation |
|---------|------------|
| Two-TX model | Implement reservation system with price locking at reserve time |
| Front-running | Slashing penalties (50-90%), UTXO locking at reservation, rate limiting |
| Slow blocks | Mempool-based optimistic UI, batch processing |
| BTC accounting | Virtual reserves tracked in contract storage, verified against UTXOs |
| Curve math | Use linear or constant-product curve (`x*y=k`) instead of exponential |
| Graduation | Pre-deploy the liquidity pool, use a trusted migration function with checks |

---

## Making It Feel Fast: Optimistic Mempool UX

You don't make Bitcoin fast. You make it *feel* fast.

### The Core Idea

Mempool as the "instant" layer. OPNet gives you real-time mempool subscriptions via WebSocket:

```typescript
await provider.subscribeMempool(async (tx: MempoolNotification) => {
    // React to buys/sells the moment they hit the mempool
    // Update UI immediately -- don't wait for block confirmation
});
```

The moment a user broadcasts a buy, every other user sees it within seconds via mempool. You treat mempool inclusion as "soft confirmation" and show it in the UI immediately with a "pending" badge.

### Three-State Transaction Model

Instead of binary confirmed/unconfirmed, show users three states:

| State | Timing | What the user sees |
|-------|--------|--------------------|
| **Broadcasted** | Instant (~1-2s) | "Your buy is submitted" -- spinner |
| **In Mempool** | Seconds (~3-10s) | "Buy detected" -- shows in activity feed, chart updates optimistically |
| **Confirmed** | ~10 min | Badge turns green, final |

This is exactly how mempool.space makes Bitcoin feel fast -- you see your tx within seconds, even though it confirms in minutes.

### Optimistic Curve Updates

The key trick: update the bonding curve price optimistically based on mempool transactions, not just confirmed blocks.

- User A buys -> hits mempool -> curve price displayed to all users moves up immediately
- User B sees the new price and decides to buy or not
- When the block confirms, you reconcile (the optimistic state should match confirmed state 99% of the time)

The risk is a mempool tx getting dropped (RBF, low fee, double-spend). Handle this with:

- Rollback optimistic state if a tx disappears from mempool after N seconds
- Show a subtle "unconfirmed" indicator so users understand the risk

### Reservation-Based Price Locking

This turns Bitcoin's "slowness" into a **feature**:

- User clicks "Buy" -> a reservation is created locking the current curve price
- The user has X blocks to complete the funding TX
- The price is guaranteed -- no slippage from other buys during the window
- Other users see the reserved amount and know the next available price

On Solana/Ethereum, you get slippage because everything races in the same block. On OPNet, the reservation system means the price you see is the price you get. That's actually better UX in some ways.

### Queue Visibility

Show users the queue of pending buys/sells. This creates:

- Transparency (you can see what's coming)
- FOMO (you see others buying)
- Price predictability (you can calculate where the curve will be after the queue clears)

---

## What You Can't Solve

Be honest about these with users:

- **Graduation to DEX** takes at least one block (~10 min). No way around it.
- **Selling during high demand** may require waiting for your reservation window.
- **RBF attacks** -- someone could broadcast a buy, move the optimistic price, then replace-by-fee to cancel. Mitigation: require minimum fee rates, show RBF-flagged txs differently.

---

## The Reframe: Fairness Over Speed

Pump.fun's speed creates a degenerate PvP race where bots win and humans lose. OPNet's block time + reservation system actually creates a fairer launch:

- No bot sniping in the same block as deploy
- Price-locked reservations mean no sandwich attacks
- Queue visibility means everyone sees the same state
- 10-minute blocks give humans time to actually think

The pitch isn't "as fast as pump.fun" -- it's **"OPump: fairer than pump.fun because it's on Bitcoin."** Bitcoin users already accept 10-minute blocks. They value security and fairness over speed. Lean into that.

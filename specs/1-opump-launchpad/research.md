# Phase 0 — Research Notes

**Branch**: `1-opump-launchpad`
**Date**: 2026-03-04

## 1. Existing Codebase Assessment

### Frontend (ALREADY BUILT — needs backend wiring)
The frontend is a comprehensive React 18 + TypeScript + Vite + Tailwind SPA with:
- **6 pages**: Home, Launch (6-step wizard), Trenches (discovery), Token (detail + trading), Profile, 404
- **42 components** organized by feature (home, token, trade, launch, chart, profile, shared, ui)
- **6 Zustand stores**: wallet, token, launch, price, trade, ui
- **3 custom hooks**: `use-bonding-curve`, `use-price-feed`, `use-trade-simulation`
- **Bonding curve simulator** in `lib/bonding-curve.ts` (constant-product AMM)
- **Mock data layer** in `src/mock/` (tokens, trades, OHLCV, profiles, stats)
- **TradingView Lightweight Charts** for price visualization
- **Form validation** via React Hook Form + Zod
- **Animations** via Framer Motion

**Status**: UI complete with mock data. Needs: real wallet integration (OPWallet via `@btc-vision/walletconnect`), backend API integration, WebSocket real-time feeds, contract deployment interaction.

### Backend (NOT STARTED)
No backend directory exists. Must be built from scratch.

### Contracts (NOT STARTED)
No contracts directory exists. Must be built from scratch.

## 2. Technology Decisions

### Decision 1: Contract Architecture — Two contracts vs. single factory

| Option | Pros | Cons |
|--------|------|------|
| **A: OPumpFactory + LaunchToken (chosen)** | Separation of concerns; factory handles registry, token handles bonding curve. Matches OP20 patterns. Each token is independent. | Two contracts to maintain. Cross-contract calls for graduation. |
| B: Single monolithic contract | Simpler deployment. No cross-contract calls. | All state in one contract. Doesn't follow OP20 standard per-token. |

**Decision: A** — Factory + per-token contract. Follows OPNet factory pattern (`IOP20Factory`). Each token extends OP20 with bonding curve logic.

### Decision 2: Bonding Curve Math — u256 precision

The constant-product formula `k = virtualBtcReserve * virtualTokenSupply` with:
- Initial BTC: 3,000,000,000 sats (30 BTC)
- Initial Token: 100,000,000,000,000,000 (1B tokens with 8 decimals)
- k = 300,000,000,000,000,000,000,000,000

This fits in u256 (max ~1.15 * 10^77). SafeMath.mul and SafeMath.div are sufficient.
Fee calculation: 1.5% = multiply by 15, divide by 1000.

### Decision 3: Reservation System — Contract-level vs. backend-level

| Option | Pros | Cons |
|--------|------|------|
| **A: Contract-level reservations (chosen)** | Trustless. On-chain enforcement. Can't be bypassed. | Uses storage pointers. More complex contract. Gas cost per reservation. |
| B: Backend-only reservations | Simpler contract. Faster to implement. | Centralized. Backend downtime = no price locking. Trust assumption. |

**Decision: A** — On-chain reservation in the LaunchToken contract. The reservation maps user address to (reservedAmount, expiryBlock, lockedPrice). Max 3 blocks TTL.

### Decision 4: Image Storage — S3 presigned upload

Per clarification: centralized CDN. Implementation:
- Backend exposes `POST /v1/upload/image` that returns a presigned S3 URL
- Frontend uploads directly to S3 via presigned URL
- Backend stores the resulting CDN URL in MongoDB with token metadata
- Alternative for MVP: store images as base64 in MongoDB (simpler, migrate later)

**Decision for MVP**: Store images in MongoDB as base64 (< 1MB limit). Migrate to S3 in Phase 6.

### Decision 5: WebSocket Architecture — HyperExpress built-in vs. separate uWS

Per OPNet guidelines, `@btc-vision/uwebsocket.js` is the WebSocket package. HyperExpress is built on top of uWebSockets.js, so its built-in WebSocket support uses the same engine.

**Decision**: Use HyperExpress's built-in `.ws()` method. Single server process handles both HTTP and WS.

## 3. OPNet SDK Key Patterns

### Contract Instantiation (Frontend)
```typescript
import { getContract, JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider({
  url: 'https://testnet.opnet.org',
  network: networks.opnetTestnet
});

// Cache contract instances — never recreate per render
const contract = getContract<ILaunchTokenContract>(
  contractAddress, LAUNCH_TOKEN_ABI, provider, network, userAddress
);
```

### Simulate → Send (Frontend)
```typescript
// 1. Simulate
const sim = await contract.buy(btcAmount);
if (sim.revert) { showError(sim.revert); return; }

// 2. Send — signer:null on frontend (OPWallet signs)
const receipt = await sim.sendTransaction({
  signer: null,
  mldsaSigner: null,
  refundTo: walletAddress,
  maximumAllowedSatToSpend: 50000n,
  feeRate: 10,
  network: networks.opnetTestnet,
});
```

### Contract Development (AssemblyScript)
- Extend OP20 for token contracts
- OP20 uses pointers 0–6 internally; custom storage starts at pointer 7+ via `Blockchain.nextPointer`
- Use `@method(...)` decorators with full param declarations
- Use `encodeSelector('methodName(types)')` for the callMethod switch
- SafeMath for ALL arithmetic
- `onDeployment()` for one-time init; constructor runs every call

## 4. MotoSwap / Graduation

MotoSwap contracts are not yet deployed on testnet per the address lookup. Graduation (Phase 5) will need to be implemented after MotoSwap is available. For now, the LaunchToken contract should:
- Track `realBtcReserve` and check against graduation threshold (6.9M sats)
- Set a `graduated` boolean flag
- Block further bonding curve trades once graduated
- The actual liquidity migration to MotoSwap will be implemented when MotoSwap addresses are available

## 5. Key Risks

| Risk | Mitigation |
|------|------------|
| Bonding curve math mismatch across 3 implementations | Shared test vectors. Same constants. Property-based tests comparing contract/backend/frontend outputs. |
| Reservation system complexity | Start with simple time-locked reservations. Add slashing penalties in Phase 4. |
| OPNet testnet instability | Build mock mode for development. Test against regtest locally. |
| Frontend already built with mock data — integration pain | Replace mock API calls one endpoint at a time. Keep mock fallback for offline dev. |
| No MotoSwap on testnet | Defer graduation (Phase 5). Contract sets graduated flag but doesn't migrate. |

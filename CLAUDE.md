# OPump — Bitcoin-Native Token Launchpad

## Overview

OPump is a pump.fun-style token launchpad built on OPNet (Bitcoin L1 smart contracts). Users can create, buy, sell, and trade tokens on a bonding curve. Tokens that reach a graduation threshold automatically migrate to a DEX.

## Architecture

```
contracts/    — AssemblyScript smart contracts (OPNet/btc-runtime)
backend/      — Node.js API server (HyperExpress + MongoDB)
frontend/     — React SPA (Vite + TailwindCSS)
shared/       — Shared types and constants
specs/        — Feature specs, plans, and task lists
```

## Setup

### Contracts

```bash
cd contracts
npm install
npm run build:token    # Compile LaunchToken.wasm
npm run build:factory  # Compile OPumpFactory.wasm
```

**Requirements**: Node 20+, `@btc-vision/assemblyscript` (NOT upstream assemblyscript)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with MongoDB URL and OPNet RPC
npm install
npm run dev
```

**Stack**: HyperExpress (NOT Express), MongoDB, OPNet SDK
**Default port**: 9850

### Frontend

```bash
cd frontend
npm install
npm run dev
```

**Stack**: React 18, Vite, TailwindCSS, Zustand
**Default port**: 5173

Set `VITE_MOTOSWAP_URL` to link graduated tokens to MotoSwap DEX (optional).

## Network Configuration

| Network | RPC URL | Package |
|---------|---------|---------|
| Regtest | http://localhost:9001 | `networks.regtest` |
| Testnet | https://testnet.opnet.org | `networks.opnetTestnet` |
| Mainnet | https://api.opnet.org | `networks.bitcoin` |

**CRITICAL**: Use `networks.opnetTestnet` (NOT `networks.testnet` which is Testnet4)

## OPNet Rules

- **SafeMath only** for all u256 operations in contracts
- **No Buffer** in contracts — use `Uint8Array`
- **signer: null, mldsaSigner: null** in frontend contract calls
- **HyperExpress required** — Express is forbidden
- **ECDSA deprecated** — use ML-DSA for signatures
- **No raw PSBT construction** — use opnet SDK

## Contract Addresses

Deployed addresses are stored in the backend `.env` file under `FACTORY_ADDRESS`.

## Mempool-First Architecture

**CRITICAL — This is the #1 recurring mistake. Read carefully.**

OPump is a **mempool-first** system. Everything reacts to mempool events, NOT confirmed blocks:

- **Trades, token creates, and all user actions appear in the UI as soon as the transaction hits the mempool.** Users must never wait for a block confirmation to see their action reflected.
- **Charts, balances, trade history, token lists — all update from mempool events.** The frontend subscribes to WebSocket events that fire on mempool detection, not on confirmation.
- **Bitcoin confirmations are just confirmations** — they confirm what already happened. One confirmation is sufficient. Do not gate any UI state or data updates behind confirmation counts.
- **The backend indexes mempool transactions** and treats them as the source of truth for current state. Confirmed blocks simply mark those transactions as confirmed.
- **Never write code that waits for a block/confirmation before updating UI state.** If a user buys a token, the trade shows immediately, the chart updates immediately, the balance updates immediately.
- **Status flow**: `mempool (pending)` → `1 confirmation (confirmed)` → done. There is no "waiting for N confirmations" logic.

If you find yourself writing code that checks confirmation count > 0 before displaying data, or that delays UI updates until a block is mined — **you are doing it wrong. Stop and fix it.**

## Constitution

### Principles

1. Never use Express.js — HyperExpress only
2. All contract math uses SafeMath — no raw u256 arithmetic
3. Frontend never holds signing keys — OPWallet handles all signing
4. All API responses follow shared type definitions in shared/types/
5. Mempool-first: all UI updates on mempool detection, not block confirmation

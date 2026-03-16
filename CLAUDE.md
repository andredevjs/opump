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

## Constitution

### Principles

1. Never use Express.js — HyperExpress only
2. All contract math uses SafeMath — no raw u256 arithmetic
3. Frontend never holds signing keys — OPWallet handles all signing
4. All API responses follow shared type definitions in shared/types/

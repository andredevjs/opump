# Data Model

**Branch**: `1-opump-launchpad`
**Date**: 2026-03-04

## On-Chain Entities (Smart Contract Storage)

### LaunchToken Contract (extends OP20)

OP20 uses pointers 0–6. Custom pointers start at 7+.

| Pointer | Storage Type | Field | Description |
|---------|-------------|-------|-------------|
| 7 | `StoredU256` | `virtualBtcReserve` | Virtual BTC reserve in sats (init: 3,000,000,000) |
| 8 | `StoredU256` | `virtualTokenSupply` | Virtual token supply (init: 1B * 10^8) |
| 9 | `StoredU256` | `kConstant` | Invariant k = virtualBtc * virtualToken |
| 10 | `StoredU256` | `realBtcReserve` | Actual BTC accumulated (triggers graduation at 6.9M sats) |
| 11 | `StoredU256` | `totalVolumeSats` | Cumulative trading volume in sats |
| 12 | `StoredBoolean` | `graduated` | Whether token has graduated to DEX |
| 13 | `StoredU256` | `creatorFeePool` | Accumulated creator fees (claimable) |
| 14 | `StoredU256` | `minterFeePool` | Accumulated minter reward fees |
| 15 | `StoredU256` | `platformFeePool` | Accumulated platform fees |
| 16 | `StoredU64` | `deployBlock` | Block number at deployment (minter eligibility window start) |
| 17 | `StoredU256` | `creatorAllocationBps` | Creator allocation in basis points (0–1000 = 0–10%) |
| 18 | `StoredU256` | `buyTaxBps` | Flywheel buy tax in basis points (0–300 = 0–3%) |
| 19 | `StoredU256` | `sellTaxBps` | Flywheel sell tax in basis points (0–500 = 0–5%) |
| 20 | `StoredU256` | `flywheelDestination` | 0=burn, 1=communityPool, 2=creator |
| 21 | `AddressMemoryMap` | `minterShares` | address → minter share amount (u256) |
| 22 | `AddressMemoryMap` | `minterBuyBlock` | address → block number of first buy (u256) |
| 23 | `StoredU256` | `totalMinterShares` | Sum of all minter shares (for proportional distribution) |
| 24 | `AddressMemoryMap` | `reservations` | address → reserved BTC amount (u256) |
| 25 | `AddressMemoryMap` | `reservationExpiry` | address → expiry block (u256) |
| 26 | `StoredU256` | `graduationThreshold` | BTC sats threshold for graduation (default: 6,900,000) |
| 27 | `StoredU256` | `minTradeAmount` | Minimum trade in sats (default: 10,000) |

**Creator address**: stored as the deployer (`Blockchain.tx.origin` at deployment).

### OPumpFactory Contract (extends OP_NET)

| Pointer | Storage Type | Field | Description |
|---------|-------------|-------|-------------|
| 0 | `StoredU256` | `tokenCount` | Total tokens deployed |
| 1 | `AddressMemoryMap` | `tokenRegistry` | index → token contract address |
| 2 | `AddressMemoryMap` | `creatorTokens` | creator address → token count |
| 3 | `StoredU256` | `totalVolume` | Aggregate volume across all tokens |
| 4 | `StoredU256` | `graduatedCount` | Total graduated tokens |
| 5 | `StoredU256` | `platformFeeRecipient` | Address for platform fee withdrawal |

## Off-Chain Entities (MongoDB)

### Collection: `tokens`

```typescript
interface TokenDocument {
  _id: string;                    // token contract address (primary key)
  name: string;
  symbol: string;
  description: string;
  imageData: string;              // base64 encoded image (MVP), URL later
  socials: {
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    github?: string;
  };
  creatorAddress: string;         // deployer wallet address
  contractAddress: string;        // on-chain contract address

  // Bonding curve state (synced from chain)
  virtualBtcReserve: string;      // stored as string for BigInt precision
  virtualTokenSupply: string;
  kConstant: string;
  realBtcReserve: string;

  // Configuration
  creatorAllocationBps: number;   // 0–1000
  airdropConfig: {
    enabled: boolean;
    type: 'moto' | 'motocat' | 'custom';
    percentBps: number;           // 10–2000 (0.1%–20%)
    customAddresses?: string[];
  };
  buyTaxBps: number;              // 0–300
  sellTaxBps: number;             // 0–500
  flywheelDestination: 'burn' | 'communityPool' | 'creator';

  // Computed/indexed
  status: 'active' | 'graduated';
  currentPriceSats: string;       // last confirmed price in sats per token
  volume24h: string;              // 24h volume in sats
  volumeTotal: string;            // all-time volume in sats
  marketCapSats: string;          // current market cap in sats
  tradeCount: number;
  holderCount: number;
  deployBlock: number;
  deployTxHash: string;
  graduatedAt?: number;           // block number of graduation

  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes**:
- `{ status: 1, volume24h: -1 }` — discovery sort
- `{ creatorAddress: 1 }` — profile lookup
- `{ name: 'text', symbol: 'text' }` — full-text search
- `{ deployBlock: -1 }` — recent tokens
- `{ currentPriceSats: -1 }` — sort by price

### Collection: `trades`

```typescript
interface TradeDocument {
  _id: string;                    // tx hash (primary key)
  tokenAddress: string;           // token contract address
  type: 'buy' | 'sell';
  traderAddress: string;
  btcAmount: string;              // sats (string for BigInt)
  tokenAmount: string;            // token amount (string for BigInt)
  pricePerToken: string;          // sats per token at time of trade
  fees: {
    platform: string;
    creator: string;
    minter: string;
    flywheel: string;
  };
  priceImpactBps: number;         // basis points
  status: 'pending' | 'confirmed';
  blockNumber?: number;           // null if pending
  blockTimestamp?: Date;
  createdAt: Date;                // when first seen (mempool or block)
}
```

**Indexes**:
- `{ tokenAddress: 1, createdAt: -1 }` — trade history per token
- `{ traderAddress: 1, createdAt: -1 }` — user trade history
- `{ status: 1, tokenAddress: 1 }` — pending trades per token
- `{ blockNumber: -1 }` — recent confirmed trades

### Collection: `platform_stats`

```typescript
interface PlatformStatsDocument {
  _id: 'current';                // singleton
  totalTokens: number;
  totalGraduated: number;
  totalVolumeSats: string;
  totalTrades: number;
  lastBlockIndexed: number;
  updatedAt: Date;
}
```

## State Transitions

### Token Lifecycle
```
[Created] → deploy tx confirmed → [Active]
[Active] → realBtcReserve >= 6.9M sats → [Graduated]
```

### Trade Lifecycle
```
[Broadcast] → mempool detection → [Pending] → block confirmation → [Confirmed]
[Pending] → dropped from mempool → [Removed] (optimistic state rolls back)
```

### Reservation Lifecycle
```
[None] → user initiates buy/sell → [Reserved] (price locked, 3-block TTL)
[Reserved] → tx confirmed within 3 blocks → [Executed] → [None]
[Reserved] → TTL expires → [Expired] (slashing penalty) → [None]
[Reserved] → user cancels → [Cancelled] (50% penalty) → [None]
```

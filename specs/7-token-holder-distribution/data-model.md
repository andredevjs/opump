# Data Model: Token Holder Distribution

## New Redis Keys

### Per-Token Holder Balance Sorted Set
```
Key:    op:holders:bal:{tokenAddress}
Type:   Sorted Set (ZADD)
Score:  balance (token units as number)
Member: holder address (string)
```

**Operations**:
- `ZADD` / `ZINCRBY` — update holder balance on buy/sell
- `ZREVRANGE ... WITHSCORES LIMIT 0 10` — get top 10 holders
- `ZREM` — remove holder when balance reaches 0
- `ZCARD` — count of holders with non-zero balance

## Modified Entities

### TokenDocument (no changes needed)
Circulating supply is derived at query time:
```
circulatingSupply = INITIAL_VIRTUAL_TOKEN_SUPPLY - BigInt(virtualTokenSupply) + creatorAllocationTokens
creatorAllocationTokens = (INITIAL_VIRTUAL_TOKEN_SUPPLY * config.creatorAllocationBps) / 10000
```

### Holder (new, API-only — not stored as document)
```typescript
interface HolderEntry {
  address: string;      // full Bitcoin address
  balance: string;      // token units (BigInt string)
  percent: number;      // percentage of circulating supply (0-100, 2 decimal places)
}
```

## API Response Types

### HolderListResponse (new)
```typescript
interface HolderListResponse {
  holders: HolderEntry[];       // top N holders, ordered by balance desc
  holderCount: number;          // total unique holders
  circulatingSupply: string;    // total tokens in circulation (BigInt string)
}
```

## State Transitions

### On Buy Trade
```
1. ZINCRBY op:holders:bal:{token} +tokenAmount {traderAddress}
2. SADD op:holders:{token} {traderAddress}  (existing behavior)
```

### On Sell Trade
```
1. ZINCRBY op:holders:bal:{token} -tokenAmount {traderAddress}
2. Read new score
3. If score <= 0:
   - ZREM op:holders:bal:{token} {traderAddress}
   - SREM op:holders:{token} {traderAddress}
```

### On Token Creation (with creator allocation)
```
1. creatorTokens = (INITIAL_VIRTUAL_TOKEN_SUPPLY * creatorAllocationBps) / 10000
2. ZADD op:holders:bal:{token} creatorTokens {creatorAddress}
3. SADD op:holders:{token} {creatorAddress}
```

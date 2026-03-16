# Data Model Changes

## TokenDocument (shared/types/token.ts)

### New Fields

| Field | Type | Default | Source |
|-------|------|---------|--------|
| `tradeCount24h` | `number` | `0` | IndexerService.updateTokenStats() computes from DB. MempoolService increments in-memory. |

### Field Fixes

| Field | Current | Fixed | Reason |
|-------|---------|-------|--------|
| `graduatedAtBlock` | Set by IndexerService | Rename to `graduatedAt` | Match shared type definition. DB migration for existing docs. |

### Unchanged Fields (clarifications)

| Field | Type | Notes |
|-------|------|-------|
| `volume24h` | `string` | Sats as string. Computed by IndexerService from 24h trade aggregation. MempoolService approximates with in-memory add. |
| `volumeTotal` | `string` | Sats as string. Computed by IndexerService from all-trade aggregation. MempoolService uses $inc with Number(). |
| `holderCount` | `number` | Currently: unique buyers. Fix: net-positive balance count (buy > sell per address). |
| `tradeCount` | `number` | All-time trade count. Already exists and is $inc'd. |
| `currentPriceSats` | `string` | Display price. Updated by both services. |
| `marketCapSats` | `string` | Computed from reserves formula. Updated by IndexerService. |

## WS Payload Schemas

### token_stats_update (new)
```typescript
interface TokenStatsPayload {
  volume24h: string       // Sats as string
  volumeTotal: string     // Sats as string
  tradeCount: number      // All-time
  tradeCount24h: number   // Last 24h
  holderCount: number
  marketCapSats: string   // Sats as string
}
```

### platform_stats_update (new)
```typescript
interface PlatformStatsPayload {
  totalTokens: number
  totalTrades: number
  totalVolumeSats: string  // Sats as string (matches API convention)
  totalGraduated: number
}
```

### token_activity (new)
```typescript
interface TokenActivityPayload {
  tokenAddress: string
  lastPrice: string       // pricePerToken from trade
  volume24h: string       // Current token doc volume24h (may be slightly stale)
  btcAmount: string       // This trade's BTC amount
}
```

### price_update (modified — add reserves to confirmed broadcasts)
```typescript
interface PriceUpdatePayload {
  currentPriceSats: string
  virtualBtcReserve: string   // NEW in confirmed broadcasts
  virtualTokenSupply: string  // NEW in confirmed broadcasts
  realBtcReserve: string      // NEW in confirmed broadcasts
  isOptimistic: boolean
}
```

### new_token (new)
```typescript
// Full TokenDetailResponse shape (mapApiTokenToToken compatible)
// Plus: priceChange24hBps: 0 (new token, no history)
```

## BroadcastDebouncer (new service)

### Internal State
```typescript
interface TokenTimer {
  timer: NodeJS.Timeout
  lastActivity: number  // Date.now()
  data: TokenStatsPayload
}

class BroadcastDebouncer {
  tokenTimers: Map<string, TokenTimer>  // tokenAddress → timer state
  platformTimer: NodeJS.Timeout | null
  platformData: PlatformStatsPayload | null
  evictionInterval: NodeJS.Timeout      // Runs every 60s
}
```

### Constants
| Name | Value | Purpose |
|------|-------|---------|
| TOKEN_DEBOUNCE_MS | 2000 | Max 1 token_stats_update per 2s per token |
| PLATFORM_DEBOUNCE_MS | 3000 | Max 1 platform_stats_update per 3s |
| INACTIVE_TTL_MS | 600000 | Evict timer after 10min no activity |
| EVICTION_INTERVAL_MS | 60000 | Check for inactive timers every 60s |

## OptimisticStateService Changes

### New Constant
| Name | Value | Purpose |
|------|-------|---------|
| MAX_PENDING | 50 | Cap pendingAdjustments per token |

### Behavior Change
- `addPendingTrade()`: If `pendingAdjustments.length >= MAX_PENDING`, drop oldest (shift)
- `getOptimisticPrice()`: On simulation error, break loop and return last-known-good reserves

## Frontend Token Interface (mappers.ts)

### Field Mapping Fixes
| API Field | Current Mapping | Fixed Mapping |
|-----------|----------------|---------------|
| `tradeCount` | `tradeCount24h: t.tradeCount` | `tradeCount24h: t.tradeCount24h` (after backend adds field) |
| `totalVolumeSats` | N/A | Ensure `parseFloat()` for string→number |

# WebSocket Event Contracts

All WS messages follow the envelope format:
```json
{
  "channel": "string",
  "event": "string",
  "data": {},
  "timestamp": 1234567890
}
```

## Channel: `platform`

### Event: `new_token`
**Source**: POST /v1/tokens route
**Debounced**: No
```typescript
// Full TokenDetailResponse shape (mapApiTokenToToken-compatible)
{
  _id: string               // Token contract address
  name: string
  symbol: string
  description: string
  imageUrl: string
  creatorAddress: string
  status: "active"
  currentPriceSats: string
  virtualBtcReserve: string
  virtualTokenSupply: string
  kConstant: string
  realBtcReserve: string
  volume24h: "0"
  volumeTotal: "0"
  tradeCount: 0
  tradeCount24h: 0
  holderCount: 0
  marketCapSats: string     // Initial market cap
  config: { ... }
  createdAt: string         // ISO date
  priceChange24hBps: 0      // New token, no history
}
```

### Event: `token_activity`
**Source**: MempoolService (pending) + IndexerService (confirmed)
**Debounced**: No (lightweight signal)
```typescript
{
  tokenAddress: string
  lastPrice: string         // pricePerToken from trade
  volume24h: string         // Current token doc volume24h
  btcAmount: string         // This trade's BTC amount
}
```

### Event: `platform_stats_update`
**Source**: MempoolService (in-memory increment) + IndexerService (canonical recount)
**Debounced**: Yes (3s)
```typescript
{
  totalTokens: number
  totalTrades: number
  totalVolumeSats: string   // Sats as string
  totalGraduated: number
}
```

### Event: `token_graduated` (existing)
```typescript
{ tokenAddress: string, blockNumber: number }
```

### Event: `token_migrating` (existing)
```typescript
{ tokenAddress: string }
```

### Event: `token_migrated` (existing)
```typescript
{ tokenAddress: string }
```

### Event: `migration_progress` (new, P3)
```typescript
{
  tokenAddress: string
  step: 1 | 2 | 3 | 4
  stepName: "mintTokens" | "createPool" | "listLiquidity" | "complete"
  status: "started" | "completed" | "failed"
}
```

## Channel: `token:price:{address}`

### Event: `price_update` (modified)
**Source**: MempoolService (optimistic) + IndexerService (confirmed)
**Debounced**: No
```typescript
{
  currentPriceSats: string
  virtualBtcReserve: string   // NOW included in confirmed broadcasts
  virtualTokenSupply: string  // NOW included in confirmed broadcasts
  realBtcReserve: string      // NOW included in confirmed broadcasts
  isOptimistic: boolean
}
```

## Channel: `token:trades:{address}` (unchanged)

### Event: `new_trade`
```typescript
{
  txHash: string
  type: "buy" | "sell"
  traderAddress: string
  btcAmount: string
  tokenAmount: string
  pricePerToken: string
  status: "pending" | "confirmed"
}
```

### Event: `trade_confirmed`
```typescript
{ txHash: string }
```

### Event: `trade_dropped`
```typescript
{ txHash: string, reason: string }
```

## Channel: `token:stats:{address}` (new)

### Event: `token_stats_update`
**Source**: MempoolService (approximate) + IndexerService (canonical)
**Debounced**: Yes (2s per token)
```typescript
{
  volume24h: string         // Sats as string
  volumeTotal: string       // Sats as string
  tradeCount: number        // All-time
  tradeCount24h: number     // Last 24h
  holderCount: number
  marketCapSats: string     // Sats as string
}
```

## Channel: `block` (unchanged)

### Event: `new_block`
```typescript
{ height: number, timestamp: number }
```

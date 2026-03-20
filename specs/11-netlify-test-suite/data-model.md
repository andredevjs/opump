# Data Model — Test Fixtures

**Branch**: `11-netlify-test-suite`
**Date**: 2026-03-19

## Test Fixture Entities

### TokenDocument (fixture)

```typescript
{
  _id: "bc1p_test_token_address",
  name: "TestToken",
  symbol: "TEST",
  description: "A test token for unit tests",
  imageUrl: "https://example.com/test.png",
  socials: { website: "https://example.com" },
  creatorAddress: "bc1p_test_creator",
  contractAddress: "bc1p_test_token_address",
  virtualBtcReserve: "767000",
  virtualTokenSupply: "100000000000000000",
  kConstant: "76700000000000000000000",
  realBtcReserve: "0",
  config: {
    creatorAllocationBps: 0,
    buyTaxBps: 0,
    sellTaxBps: 0,
    flywheelDestination: "burn",
    graduationThreshold: "6900000",
  },
  status: "active",
  currentPriceSats: "7670",
  volume24h: "0",
  volumeTotal: "0",
  marketCapSats: "0",
  tradeCount: 0,
  holderCount: 0,
  deployBlock: 100,
  deployTxHash: "a".repeat(64),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}
```

### TradeDocument (fixture)

```typescript
{
  _id: "b".repeat(64),  // txHash
  tokenAddress: "bc1p_test_token_address",
  type: "buy",
  traderAddress: "bc1p_test_trader",
  btcAmount: "100000",
  tokenAmount: "11403990276138280",
  pricePerToken: "8770",
  fees: { platform: "1000", creator: "250", flywheel: "0" },
  priceImpactBps: 1287,
  status: "pending",
  createdAt: new Date("2026-01-01T00:01:00Z"),
}
```

### OHLCV Candle (expected shape)

```typescript
{
  time: 1735689600,  // Unix timestamp (bucket start)
  open: 7670,
  high: 8770,
  low: 7670,
  close: 8770,
  volume: 100000,
}
```

### Referral Data (fixture)

```typescript
// Code
{ code: "ABC123", wallet: "bc1p_referrer" }

// Link
{ referredWallet: "bc1p_referred", referrerWallet: "bc1p_referrer" }

// Earnings
{ totalSats: "150", tradeCount: 3, referralCount: 1 }
```

## Redis Key Schema (for mock verification)

| Pattern | Type | Description |
|---------|------|-------------|
| `op:token:{addr}` | Hash | Token document fields |
| `op:trade:{txHash}` | Hash | Trade document fields |
| `op:idx:token:{status}:{sort}` | Sorted Set | Token listing indexes |
| `op:idx:token:creator:{addr}` | Set | Creator's tokens |
| `op:idx:token:search` | Sorted Set | Lexicographic search |
| `op:idx:trade:token:{addr}` | Sorted Set | Token's trades by time |
| `op:idx:trade:trader:{addr}` | Sorted Set | Trader's trades by time |
| `op:holders:{addr}` | Set | Token holder addresses |
| `op:holders:bal:{addr}` | Sorted Set | Holder balances |
| `op:ohlcv:{addr}:{tf}:{bucket}` | Hash | OHLCV candle |
| `op:ohlcv:idx:{addr}:{tf}` | Sorted Set | Candle index |
| `op:rl:{prefix}:{id}` | String (counter) | Rate limit counters |
| `op:ref:code:{CODE}` | Hash | Referral code → wallet |
| `op:ref:wallet:{addr}` | String | Wallet → code |
| `op:ref:link:{addr}` | String | Wallet → referrer |
| `op:ref:earnings:{addr}` | Hash | Referral earnings |
| `op:idx:ref:by:{addr}` | Set | Referred wallets |
| `op:stats` | Hash | Platform stats |
| `op:indexer:lastBlock` | String | Last indexed block |
| `op:indexer:lock` | String | Distributed lock |

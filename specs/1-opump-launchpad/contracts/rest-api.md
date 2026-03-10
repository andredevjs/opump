# REST API Contract

**Base URL**: `http://localhost:3000/v1`
**Framework**: HyperExpress (Express FORBIDDEN)

## Endpoints

### GET /v1/tokens

List tokens with filtering, sorting, and pagination.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 12 | Items per page (max 50) |
| `status` | string | `all` | Filter: `all`, `active`, `graduated` |
| `search` | string | — | Full-text search on name/symbol |
| `sort` | string | `volume24h` | Sort field: `volume24h`, `marketCap`, `price`, `newest` |
| `order` | string | `desc` | Sort order: `asc`, `desc` |

**Response** `200`:
```json
{
  "tokens": [
    {
      "address": "bcrt1q...",
      "name": "My Token",
      "symbol": "MTK",
      "imageUrl": "data:image/png;base64,...",
      "status": "active",
      "currentPriceSats": "1500",
      "volume24h": "5000000",
      "marketCapSats": "150000000",
      "realBtcReserve": "2000000",
      "graduationProgress": 28.98,
      "tradeCount": 42,
      "createdAt": "2026-03-04T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 12,
    "total": 156,
    "pages": 13
  }
}
```

---

### GET /v1/tokens/:address

Get full token detail.

**Response** `200`:
```json
{
  "address": "bcrt1q...",
  "name": "My Token",
  "symbol": "MTK",
  "description": "A token for...",
  "imageUrl": "data:image/png;base64,...",
  "socials": {
    "website": "https://...",
    "twitter": "https://twitter.com/..."
  },
  "creatorAddress": "bcrt1q...",
  "virtualBtcReserve": "3000000000",
  "virtualTokenSupply": "100000000000000000",
  "kConstant": "300000000000000000000000000",
  "realBtcReserve": "2000000",
  "currentPriceSats": "1500",
  "status": "active",
  "config": {
    "creatorAllocationBps": 500,
    "buyTaxBps": 100,
    "sellTaxBps": 200,
    "flywheelDestination": "burn"
  },
  "stats": {
    "volume24h": "5000000",
    "volumeTotal": "50000000",
    "marketCapSats": "150000000",
    "tradeCount": 42,
    "holderCount": 18
  },
  "graduationProgress": 28.98,
  "deployBlock": 100,
  "deployTxHash": "abc123..."
}
```

**Response** `404`: `{ "error": "Token not found" }`

---

### GET /v1/tokens/:address/trades

Trade history for a token.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `status` | string | `all` | `all`, `pending`, `confirmed` |

**Response** `200`:
```json
{
  "trades": [
    {
      "txHash": "abc123...",
      "type": "buy",
      "traderAddress": "bcrt1q...",
      "btcAmount": "100000",
      "tokenAmount": "66666666",
      "pricePerToken": "1500",
      "fees": {
        "platform": "1000",
        "creator": "250",
        "minter": "250",
        "flywheel": "0"
      },
      "priceImpactBps": 33,
      "status": "confirmed",
      "blockNumber": 105,
      "createdAt": "2026-03-04T12:05:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 42, "pages": 3 }
}
```

---

### GET /v1/tokens/:address/price

Current price and reserves.

**Response** `200`:
```json
{
  "currentPriceSats": "1500",
  "virtualBtcReserve": "3000100000",
  "virtualTokenSupply": "99933333334",
  "realBtcReserve": "2100000",
  "isOptimistic": false,
  "pendingBuySats": "50000",
  "pendingSellTokens": "0"
}
```

---

### GET /v1/tokens/:address/ohlcv

OHLCV candle data aggregated from confirmed trades.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `timeframe` | string | `15m` | Candle interval: `1m`, `5m`, `15m`, `1h`, `4h`, `1d` |
| `limit` | number | 200 | Max candles to return (max 500) |

**Response** `200`:
```json
{
  "candles": [
    {
      "time": 1709568000,
      "open": 1500,
      "high": 1520,
      "low": 1480,
      "close": 1510,
      "volume": 250000
    }
  ],
  "timeframe": "15m",
  "tokenAddress": "bcrt1q..."
}
```

**Response** `400`: `{ "error": "BadRequest", "message": "Invalid timeframe" }`

---

### POST /v1/simulate/buy

Simulate a buy trade.

**Request Body**:
```json
{
  "tokenAddress": "bcrt1q...",
  "btcAmountSats": "100000"
}
```

**Response** `200`:
```json
{
  "tokensOut": "66666666",
  "pricePerToken": "1500",
  "priceImpactBps": 33,
  "fees": {
    "platform": "1000",
    "creator": "250",
    "minter": "250",
    "flywheel": "0",
    "total": "1500"
  },
  "newPriceSats": "1505",
  "reservesAfter": {
    "virtualBtc": "3000100000",
    "virtualToken": "99933333334"
  }
}
```

**Response** `400`: `{ "error": "Amount below minimum (10,000 sats)" }`

---

### POST /v1/simulate/sell

Simulate a sell trade.

**Request Body**:
```json
{
  "tokenAddress": "bcrt1q...",
  "tokenAmount": "66666666"
}
```

**Response** `200`: Same structure as buy simulation with inverted direction.

---

### GET /v1/stats

Platform-level statistics.

**Response** `200`:
```json
{
  "totalTokens": 156,
  "totalGraduated": 7,
  "totalVolumeSats": "500000000000",
  "totalTrades": 12500,
  "lastBlockIndexed": 250
}
```

---

### GET /v1/profile/:address/tokens

Tokens created by an address.

**Response** `200`:
```json
{
  "tokens": [
    {
      "address": "bcrt1q...",
      "name": "My Token",
      "symbol": "MTK",
      "status": "active",
      "volume24h": "5000000",
      "currentPriceSats": "1500"
    }
  ]
}
```

---

### POST /v1/tokens

Register a newly deployed token (called by indexer or admin).

**Request Body**:
```json
{
  "contractAddress": "bcrt1q...",
  "name": "My Token",
  "symbol": "MTK",
  "description": "...",
  "imageData": "base64...",
  "socials": {},
  "creatorAddress": "bcrt1q...",
  "config": {
    "creatorAllocationBps": 500,
    "airdropConfig": { "enabled": true, "type": "moto", "percentBps": 500 },
    "buyTaxBps": 100,
    "sellTaxBps": 200,
    "flywheelDestination": "burn"
  },
  "deployTxHash": "abc123..."
}
```

**Response** `201`: Token document.

## Error Format

All errors follow:
```json
{
  "error": "Human-readable error message",
  "code": "VALIDATION_ERROR"
}
```

| HTTP Status | Code | When |
|-------------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error (no details leaked) |

# API Contract: Token Holders Endpoint

## GET /api/v1/tokens/:address/holders

Returns the top holders for a token with their balances and percentage of circulating supply.

### Path Parameters
| Param   | Type   | Description              |
|---------|--------|--------------------------|
| address | string | Token contract address   |

### Query Parameters
| Param | Type   | Default | Description               |
|-------|--------|---------|---------------------------|
| limit | number | 10      | Max holders to return (1-50) |

### Response 200
```json
{
  "holders": [
    {
      "address": "bc1p...",
      "balance": "5000000000000000",
      "percent": 45.23
    },
    {
      "address": "bc1p...",
      "balance": "2000000000000000",
      "percent": 18.09
    }
  ],
  "holderCount": 47,
  "circulatingSupply": "11055000000000000"
}
```

### Response 404
```json
{
  "error": "NotFound",
  "message": "Token not found",
  "statusCode": 404
}
```

### Notes
- `holders` is ordered by balance descending (largest holder first)
- `balance` is in token units (raw BigInt string, divide by 10^TOKEN_DECIMALS for human-readable)
- `percent` is `(balance / circulatingSupply) * 100`, rounded to 2 decimal places
- `holderCount` is the total number of unique holders (not just the returned subset)
- `circulatingSupply` is derived from bonding curve state + creator allocation
- Holders with zero balance are excluded

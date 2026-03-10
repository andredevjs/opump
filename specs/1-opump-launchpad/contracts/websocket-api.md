# WebSocket API Contract

**URL**: `ws://localhost:3000/ws`
**Protocol**: JSON messages over WebSocket (HyperExpress built-in)

## Connection

Client connects to `ws://host/ws`. No authentication required.

## Message Format

### Client → Server

```typescript
interface ClientMessage {
  action: 'subscribe' | 'unsubscribe';
  channel: string;
  filter?: string;  // token address for token-specific channels
}
```

### Server → Client

```typescript
interface ServerMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: number;
}
```

## Channels

### `token:price:{address}`

Real-time price updates for a specific token.

**Subscribe**: `{ "action": "subscribe", "channel": "token:price", "filter": "bcrt1q..." }`

**Events**:
```json
{
  "channel": "token:price:bcrt1q...",
  "event": "price_update",
  "data": {
    "currentPriceSats": "1505",
    "virtualBtcReserve": "3000100000",
    "virtualTokenSupply": "99933333334",
    "realBtcReserve": "2100000",
    "isOptimistic": true,
    "change24hBps": 150
  },
  "timestamp": 1709568000000
}
```

---

### `token:trades:{address}`

Trade feed for a specific token (confirmed + pending).

**Events**:
```json
{
  "channel": "token:trades:bcrt1q...",
  "event": "new_trade",
  "data": {
    "txHash": "abc123...",
    "type": "buy",
    "traderAddress": "bcrt1q...",
    "btcAmount": "100000",
    "tokenAmount": "66666666",
    "status": "pending",
    "pricePerToken": "1500"
  },
  "timestamp": 1709568000000
}
```

```json
{
  "channel": "token:trades:bcrt1q...",
  "event": "trade_confirmed",
  "data": {
    "txHash": "abc123...",
    "blockNumber": 105
  },
  "timestamp": 1709568600000
}
```

```json
{
  "channel": "token:trades:bcrt1q...",
  "event": "trade_dropped",
  "data": {
    "txHash": "abc123...",
    "reason": "replaced_by_fee"
  },
  "timestamp": 1709568300000
}
```

---

### `platform:newtoken`

New token launched.

**Subscribe**: `{ "action": "subscribe", "channel": "platform:newtoken" }`

**Events**:
```json
{
  "channel": "platform:newtoken",
  "event": "token_launched",
  "data": {
    "address": "bcrt1q...",
    "name": "New Token",
    "symbol": "NTK",
    "creatorAddress": "bcrt1q..."
  },
  "timestamp": 1709568000000
}
```

---

### `platform:graduation`

Token graduated to DEX.

**Events**:
```json
{
  "channel": "platform:graduation",
  "event": "token_graduated",
  "data": {
    "address": "bcrt1q...",
    "name": "Graduated Token",
    "symbol": "GTK",
    "finalBtcReserve": "6900000",
    "blockNumber": 250
  },
  "timestamp": 1709568000000
}
```

---

### `block`

New block indexed.

**Events**:
```json
{
  "channel": "block",
  "event": "new_block",
  "data": {
    "height": 251,
    "timestamp": 1709568000,
    "txCount": 12
  },
  "timestamp": 1709568000000
}
```

## Error Messages

```json
{
  "channel": "error",
  "event": "subscription_error",
  "data": {
    "message": "Invalid channel format",
    "originalMessage": { ... }
  },
  "timestamp": 1709568000000
}
```

## Heartbeat

Server sends ping every 30 seconds. Client must respond with pong or connection is closed after 60 seconds.

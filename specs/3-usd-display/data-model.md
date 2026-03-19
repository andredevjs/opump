# Data Model: USD Display

## New Entity: BTC Price State

```
BtcPriceState
├── btcUsdPrice: number        — Current BTC/USD rate (e.g., 65000)
├── lastFetchedAt: number      — Unix ms timestamp of last successful fetch
├── loading: boolean           — True during initial fetch only
└── error: string | null       — Last fetch error message (if any)
```

**Storage**: Zustand store (`btc-price-store.ts`) + localStorage persistence for cross-session cache.

**Lifecycle**:
1. On app mount → load cached price from localStorage (instant, no loading state)
2. Fetch fresh price from CoinGecko
3. On success → update store + localStorage
4. Repeat every 2 minutes via `setInterval`
5. On fetch failure → keep last known price, set error (for debugging only — UI unaffected)

## Modified Entities

No changes to existing Token, Trade, or Store types. All sats fields remain as-is — conversion to USD happens at the display layer only.

## New Utility Functions

```
formatUsd(sats: number | string, btcPrice: number) → string
  — General monetary display: "$1.23", "$4.5k", "$1.2M", "$3.4B"

formatUsdPrice(sats: number, btcPrice: number) → string
  — Token price display: "$0.000325", "$0.0142", "$1.23"

satsToUsd(sats: number, btcPrice: number) → number
  — Raw conversion: sats / 100_000_000 * btcPrice

usdToSats(usd: number, btcPrice: number) → number
  — Inverse conversion: (usd / btcPrice) * 100_000_000
```

## React Hook

```
useBtcPrice() → { btcPrice: number; loading: boolean }
  — Selector into btc-price-store, returns current rate
  — Components call: formatUsd(sats, btcPrice)
```

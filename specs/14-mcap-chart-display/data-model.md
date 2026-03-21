# Data Model: MCAP Chart Display

**Branch**: `14-mcap-chart-display` | **Date**: 2026-03-21

## Entities

No new data entities are created. This feature is a **display-only transformation** applied at the frontend rendering layer.

### Existing entities (unchanged)

- **OHLCVCandle**: `{ time, open, high, low, close, volume }` — candle values remain in `pricePerToken` (sats) from the API. Transformation to MCAP USD happens at the component level.
- **Token**: `marketCapSats`, `realBtcReserve`, `graduationProgress` — all unchanged. Already computed and stored in sats.
- **BTC/USD Price**: Fetched from CoinGecko, cached in `btc-price-store`. No changes.

### New constants

- `TOTAL_SUPPLY_WHOLE_TOKENS = 1_000_000_000` — derived constant for the conversion multiplier (avoids BigNumber in hot path)

# Research: MCAP Chart Display

**Branch**: `14-mcap-chart-display` | **Date**: 2026-03-21

## Price → MCAP Conversion Math

### Current price format
- `pricePerToken` stored in trades/candles = `toDisplayPrice((virtualBtc * 10^18) / virtualToken)` = `virtualBtc * 10^8 / virtualToken`
- This is a small number (e.g., 0.000767 at initial state, ~0.0767 at graduation)
- Units: effectively "sats per token unit" (per 10^-8 of a whole token)

### Conversion formula
```
mcapSats = pricePerToken × INITIAL_VIRTUAL_TOKEN_SUPPLY / TOKEN_UNITS_PER_TOKEN
         = pricePerToken × 10^17 / 10^8
         = pricePerToken × 10^9
         = pricePerToken × 1,000,000,000

mcapUsd  = mcapSats / SATS_PER_BTC × btcPrice
         = pricePerToken × 10^9 / 10^8 × btcPrice
         = pricePerToken × 10 × btcPrice
```

### Verification
- Initial: `0.000767 × 10 × $90,000 = $690` (correct)
- Graduation: `0.0767 × 10 × $90,000 = $69,030 ≈ $69k` (correct)

### Graduation MCAP target
The 6.9M sats graduation threshold produces:
- At graduation: virtualBtc = 767,000 + 6,900,000 = 7,667,000
- virtualToken = K / 7,667,000 ≈ 10,003,914,015,841,667
- mcapSats = (7,667,000 / 10,003,914,015,841,667) × 10^17 ≈ 76,637,000 sats
- mcapUsd = 76,637,000 / 10^8 × btcPrice = 0.76637 × btcPrice
- At $90k BTC: ~$69k. Confirmed.

## Component Usage Map

| Component | Used In | Mode | Needs btcPrice? |
|-----------|---------|------|-----------------|
| PriceChart | TokenPage (line 118) | full | Yes (via transformed candles) |
| BondingCurveVisual | TokenPage (line 194) | full | Yes (new prop) |
| GraduationProgress | TokenPage (lines 199, 261) | full | Yes (new prop) |
| GraduationProgress | TokenCard (line 69) | compact | No (compact hides labels) |

## lightweight-charts formatter

The `priceFormat.formatter` in lightweight-charts controls both:
1. Y-axis scale labels
2. Crosshair horizontal label (tooltip)
3. Last-value label

So changing the formatter + data values covers FR-001 and FR-002 automatically.

## Decisions

1. **Historical candles use current BTC price** — standard for pump-style platforms. No historical BTC price data needed.
2. **On-chain threshold unchanged** — 6.9M sats stays. Only frontend display changes.
3. **Compact GraduationProgress unaffected** — TokenCard uses compact mode which hides the labels, so no prop changes needed there.
4. **Simplified conversion constant**: `TOTAL_SUPPLY_WHOLE_TOKENS = 1_000_000_000` avoids BigNumber math in hot render path.

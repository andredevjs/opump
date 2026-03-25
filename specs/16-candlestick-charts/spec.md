# Feature Specification: Candlestick Chart Option & Real-Time Trade Reflection

**Feature Branch**: `16-candlestick-charts`
**Created**: 2026-03-25
**Status**: Draft

## User Scenarios & Testing

### User Story 1 — Toggle Between Line and Candlestick Views (Priority: P1)

As a trader viewing a token page, I want to switch between a line chart and a candlestick chart so I can analyze price action using the visualization style I prefer.

**Why this priority**: Candlestick charts are the standard for crypto/finance trading; traders expect them and rely on OHLC patterns (doji, hammer, engulfing) for decision-making.

**Independent Test**: Open any token detail page, verify both chart types render correctly with the same underlying data, and toggle between them.

**Acceptance Scenarios**:
1. **Given** I am on a token detail page viewing the line chart, **When** I click a "Candlestick" toggle, **Then** the chart switches to candlestick rendering showing open, high, low, close per candle with green (up) / red (down) coloring.
2. **Given** I am viewing the candlestick chart, **When** I click the "Line" toggle, **Then** the chart switches back to the line view.
3. **Given** I switch chart types, **When** the chart re-renders, **Then** the volume histogram at the bottom remains visible and unchanged regardless of chart type.
4. **Given** I select a chart type and then change the timeframe (1m, 5m, 15m, 1H, 4H, 1D), **When** new data loads, **Then** the selected chart type persists.
5. **Given** I select candlestick view, **When** I leave the token page and return (or visit another token), **Then** my chart type preference is remembered for the session.

### User Story 2 — Trades Appear on Chart Immediately (Priority: P1)

As a user who just bought or sold a token, I want my trade to be reflected on the chart, in trade history, in volume, in holders, in market cap, and on the bonding curve immediately — without waiting for a block confirmation.

**Why this priority**: Mempool-first is a core architectural principle. Users must see instant feedback for every action. Delayed reflection erodes trust and causes duplicate transactions.

**Independent Test**: Execute a buy or sell, then verify every data surface updates within the next polling cycle (≤ 2.5 seconds for chart, ≤ 15 seconds for trade history).

**Acceptance Scenarios**:
1. **Given** I execute a buy, **When** the transaction hits the mempool, **Then** within the next chart poll the new candle (or updated current candle) reflects the trade's price impact — on both line and candlestick views.
2. **Given** I execute a sell, **When** the transaction hits the mempool, **Then** the trade history table shows the sell with a pending indicator, and the chart's current candle updates its close/high/low accordingly.
3. **Given** a trade hits the mempool, **When** the chart updates, **Then** the volume histogram bar for the current time bucket increases by the trade's BTC volume.
4. **Given** I buy tokens for the first time, **When** the holders list next polls, **Then** I appear in the holders list with my balance.
5. **Given** a trade changes the token's reserves, **When** the price endpoint next responds, **Then** market cap, bonding curve position, and graduation progress all update to reflect the new reserves.
6. **Given** a pending trade is later confirmed, **When** the confirmed version arrives, **Then** the system deduplicates — no double-counted volume, no phantom candle, no duplicate trade history row.

### User Story 3 — Candlestick Chart Readability and Interaction (Priority: P2)

As a trader, I want the candlestick chart to be readable and interactive so I can analyze price patterns effectively.

**Why this priority**: A candlestick chart that is hard to read or interact with defeats its purpose. Usability is critical for trader confidence.

**Independent Test**: Load a token with varied trade history; verify candles are visually distinct, crosshair shows OHLCV data, and the chart handles edge cases gracefully.

**Acceptance Scenarios**:
1. **Given** I hover over a candle, **When** the crosshair tooltip appears, **Then** it displays open, high, low, close values (formatted to appropriate decimal precision) and volume for that time bucket.
2. **Given** a time bucket has no trades, **When** the chart renders, **Then** that bucket either shows no candle or carries forward the previous close as a flat candle (no gaps in the series).
3. **Given** there is only one trade in a time bucket, **When** the candle renders, **Then** open = close = high = low = that trade's price, and the candle is visible (not invisible due to zero height).
4. **Given** I am on mobile, **When** I view the candlestick chart, **Then** the candles are appropriately sized and the chart remains scrollable/zoomable via touch gestures.

### Edge Cases

- **No trades yet**: Chart displays empty state or a single point at the initial bonding curve price — no crash or broken rendering.
- **Extremely volatile candle**: A candle with >100× wick-to-body ratio still renders readably (wicks don't overflow the chart area).
- **Rapid consecutive trades**: Multiple trades in the same second merge into the same candle correctly, not creating duplicates.
- **Page load with candlestick preference**: If the user's session preference is candlestick, the chart loads directly as candlestick without briefly flashing as a line chart.
- **Graduated token**: Candlestick chart works the same for graduated tokens (data source may differ but display behavior is identical).

## Requirements

### Functional Requirements

- **FR-001**: System MUST provide a toggle control allowing the user to switch between line chart and candlestick chart views.
- **FR-002**: Candlestick chart MUST render standard OHLC candles with distinct colors for bullish (close ≥ open) and bearish (close < open) candles.
- **FR-003**: Volume histogram MUST remain visible and accurate beneath both chart types.
- **FR-004**: Chart type preference MUST persist within the user's browser session.
- **FR-005**: All chart data (candles, volume) MUST update from mempool events — never gated behind block confirmations.
- **FR-006**: Trade history MUST display new trades as soon as they appear in the mempool, with a visual pending indicator.
- **FR-007**: Market cap, graduation progress, and bonding curve position MUST update within the same polling cycle as the price change that caused them.
- **FR-008**: Crosshair/tooltip on candlestick chart MUST show OHLCV values for the hovered candle.
- **FR-009**: The toggle control MUST be visually consistent with existing chart controls (timeframe selector).
- **FR-010**: When no OHLCV data exists for a time bucket, the system MUST handle the gap gracefully (no broken rendering or NaN values).

### Key Entities

- **Candle**: Represents a time-bucketed price summary — open, high, low, close, volume, timestamp. One per timeframe bucket.
- **Trade**: A buy or sell event — type, token amount, BTC amount, trader address, timestamp, status (pending/confirmed).
- **Chart Type Preference**: User's selected visualization mode (line or candlestick), scoped to the browser session.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Users can switch between line and candlestick views with no perceptible delay (< 200ms re-render).
- **SC-002**: A trade executed by the user is visible on the chart within the next polling interval (≤ 2.5 seconds).
- **SC-003**: A trade executed by the user appears in the trade history within the next trade poll (≤ 15 seconds).
- **SC-004**: Zero duplicate trades or double-counted volume when a pending trade is confirmed.
- **SC-005**: Candlestick chart renders correctly across all six timeframes (1m, 5m, 15m, 1H, 4H, 1D).
- **SC-006**: Chart type preference persists across token page navigations within the same session.
- **SC-007**: No regression in existing line chart or volume histogram behavior.

## Assumptions

- The existing OHLCV API endpoint already provides sufficient data for candlestick rendering (open, high, low, close, volume per bucket). No new API endpoints are needed.
- The existing charting library supports candlestick series natively.
- "Session" for preference persistence means browser tab/session storage — not persisted across browser restarts.
- The existing mempool-first polling architecture (2.5s chart, 15s trades, 30s holders) provides acceptable real-time responsiveness without needing websockets or faster polling.

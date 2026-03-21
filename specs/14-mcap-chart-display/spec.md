# Feature Specification: MCAP $ Display on Charts & Bonding Curve

**Feature Branch**: `14-mcap-chart-display`
**Created**: 2026-03-21
**Status**: Draft

## User Scenarios & Testing

### User Story 1 - View Market Cap on Price Chart (Priority: P1)
As a trader viewing a token's price chart, I want the Y-axis to display the token's market capitalization in USD so I can quickly understand the token's total value and compare it to familiar dollar benchmarks (e.g., "$10k", "$69k") without mentally converting sub-satoshi price values.

**Why this priority**: The price chart is the primary interface traders use to evaluate tokens. Sub-sat values (0.000767) are unintuitive; MCAP in USD is the universal metric traders use to size positions and evaluate opportunity.

**Independent Test**: Navigate to any token's detail page. Observe the price chart Y-axis labels and crosshair tooltip values.

**Acceptance Scenarios**:
1. **Given** a token has active trades, **When** the user views the price chart, **Then** the Y-axis displays market cap in USD (e.g., "$690", "$1.2k", "$45k") instead of raw price-per-token values.
2. **Given** the chart is displaying MCAP USD, **When** the user hovers over a candle, **Then** the crosshair tooltip shows the MCAP value in USD at that point in time.
3. **Given** BTC/USD price is available, **When** candle data is rendered, **Then** all OHLCV values (open, high, low, close) are converted to MCAP USD using the formula: `mcapUsd = pricePerToken × totalSupplyWholeTokens × btcPrice / satsPerBtc`.
4. **Given** BTC/USD price is not yet loaded (zero or loading), **When** the chart renders, **Then** values display as "$0" or the chart shows a loading state rather than broken/misleading values.

---

### User Story 2 - View MCAP $ on Bonding Curve Visualization (Priority: P1)
As a trader evaluating a token's bonding curve, I want the curve visualization to show MCAP in USD on the Y-axis so I can see where the token currently sits relative to the ~$69k graduation target.

**Why this priority**: The bonding curve visualization is the key tool for understanding how close a token is to graduation. Dollar values make the graduation target ($69k) immediately meaningful.

**Independent Test**: Navigate to a token's detail page, click the "Bonding Curve" tab, and observe the curve visualization.

**Acceptance Scenarios**:
1. **Given** a token is active (not graduated), **When** the bonding curve is displayed, **Then** the Y-axis shows MCAP USD labels (e.g., "$0", "$35k", "$69k").
2. **Given** the bonding curve is displayed, **When** the user views the visualization, **Then** a graduation target reference is visible at the ~$69k MCAP level.
3. **Given** the token has trading activity, **When** the bonding curve renders, **Then** the current position indicator reflects the token's current MCAP in USD.

---

### User Story 3 - View Graduation Progress in MCAP $ (Priority: P2)
As a trader watching a token's graduation progress, I want to see how close the token is to the $69k MCAP graduation target in dollar terms, rather than in BTC/sats values that require mental conversion.

**Why this priority**: Graduation progress is a secondary indicator (the bonding curve and chart already convey this). Showing it in USD provides consistency and reinforces the $69k target.

**Independent Test**: Navigate to a token's detail page and observe the graduation progress bars (sidebar and bonding curve tab).

**Acceptance Scenarios**:
1. **Given** a token is active, **When** the graduation progress is displayed, **Then** the bottom labels show current MCAP in USD and the graduation target MCAP in USD (approximately $69k, varying with BTC price).
2. **Given** BTC price is $90,000, **When** graduation progress renders, **Then** the target displays as approximately "$69k" (derived dynamically from the 6.9M sats threshold and current BTC price).
3. **Given** a token has graduated, **When** the graduation progress is displayed, **Then** the status label shows "Graduated to DEX" and the progress is 100%, with the target still shown in USD.

---

### Edge Cases
- **BTC price unavailable**: If the BTC/USD price has not loaded yet, all MCAP USD values should show as "$0.00" or a placeholder until the price is available. No NaN or broken formatting.
- **Very early tokens**: A brand-new token with no trades should show the initial MCAP (~$690 at $90k BTC) rather than $0.
- **BTC price volatility**: Since all historical candle values use the *current* BTC/USD rate (not the rate at the time of the trade), displayed MCAP values are approximate. This is acceptable and standard for mempool-first platforms.
- **Extremely low BTC price**: If BTC price drops significantly, the graduation MCAP target will appear lower (e.g., $34.5k at $50k BTC). The graduation threshold in sats remains fixed; only the USD display changes.
- **Chart autoscaling**: The chart must autoscale correctly for the new value range (hundreds to tens of thousands of dollars), including when prices cluster tightly.

## Requirements

### Functional Requirements
- **FR-001**: The price chart Y-axis MUST display values as market capitalization in USD, not raw price-per-token.
- **FR-002**: The chart crosshair/tooltip MUST show MCAP USD values when hovering over data points.
- **FR-003**: The bonding curve visualization MUST display MCAP USD labels on its Y-axis.
- **FR-004**: The bonding curve visualization MUST indicate the graduation target at the ~$69k MCAP level.
- **FR-005**: The graduation progress indicator MUST show current and target values in MCAP USD instead of BTC/sats.
- **FR-006**: All MCAP USD values MUST be computed dynamically from the current BTC/USD exchange rate.
- **FR-007**: MCAP USD formatting MUST use human-readable abbreviations (e.g., "$1.2k", "$69k", "$1.2M").

### Key Entities
- **Market Cap (MCAP)**: The total USD value of a token's supply, calculated as: `pricePerToken × totalSupply × (btcPrice / satsPerBtc)`. Ranges from ~$690 (initial) to ~$69k (graduation) at ~$90k BTC.
- **Graduation Target**: The MCAP at which a token graduates from the bonding curve to DEX trading. Currently ~$69k (derived from 6.9M sats threshold at ~$90k BTC). Displayed dynamically based on current BTC price.

## Assumptions
- Historical candle MCAP values use the current BTC/USD rate, not the historical rate at each candle's timestamp. This is standard practice for this type of platform.
- The on-chain graduation threshold (6.9M sats) does not change. Only the frontend display is affected.
- The BTC/USD price source (CoinGecko, polled every 2 minutes) remains the same.

## Success Criteria

### Measurable Outcomes
- **SC-001**: 100% of Y-axis labels on the price chart display as USD-formatted market cap values (e.g., "$1.2k") instead of raw price values.
- **SC-002**: The bonding curve visualization shows at least 2 MCAP USD reference labels including the graduation target.
- **SC-003**: Both graduation progress indicators display current and target values in MCAP USD.
- **SC-004**: No instances of raw sub-sat price values (e.g., "0.000767") visible in chart axes, tooltips, or bonding curve labels.
- **SC-005**: All MCAP USD values update correctly when BTC/USD price changes (within the 2-minute polling interval).

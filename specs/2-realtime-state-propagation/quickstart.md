# Validation Scenarios

Manual testing checklist against OPNet testnet.

## Phase 0 Validation

### V-0a: parseInt fix
1. Submit a trade with btcAmount > 2^31 sats (>21.5 BTC)
2. Verify platform stats totalVolumeSats increments by the full amount, not a truncated value
3. Drop the trade and verify stats decrement by the same full amount

### V-0b: Simulation with pending trades
1. Submit a buy trade (don't confirm yet — stay in mempool)
2. Open a second browser and simulate a buy on the same token
3. Verify the simulation result accounts for the pending trade's price impact
4. The simulated price should be higher than if no pending trade existed

### V-0c: OptimisticStateService cap
1. Submit 50+ pending trades on a single token (scripted)
2. Verify `getOptimisticPrice()` returns within 200ms
3. Verify the 51st trade causes the 1st to be dropped from optimistic state

### V-0d: Confirmed price_update includes reserves
1. Open token detail page, watch WS messages in browser devtools
2. Wait for a trade to confirm on-chain
3. Verify the `price_update` message includes `virtualBtcReserve`, `virtualTokenSupply`, `realBtcReserve`
4. Verify graduation progress bar updates without page refresh

## Phase 1 Validation

### V-1a: Global WS
1. Navigate to TrenchesPage (not TokenPage)
2. Open browser devtools → Network → WS
3. Verify a WebSocket connection is established on page load

### V-1b: Reconnection recovery
1. Open token detail page with active trades
2. Disconnect network for 10 seconds
3. Reconnect network
4. Verify: data refreshes within 5 seconds, no stale prices displayed

### V-1c: Platform stats real-time
1. Open homepage
2. From another browser, create a token or execute a trade
3. Verify PlatformStats updates within 3 seconds (no page refresh)

### V-1d: New token instant appearance
1. Open TrenchesPage sorted by "newest"
2. From another browser, create a new token
3. Verify the token appears at the top within 2 seconds

### V-1e: Token activity on listing pages
1. Open TrenchesPage
2. From another browser, buy a listed token
3. Verify the token's price and volume update within 2 seconds

### V-1f: SellForm balance after buy
1. Open token detail page, buy tokens
2. Switch to sell tab
3. Verify available balance shows newly purchased tokens without page refresh

### V-1g: Token stats feed
1. Open token detail page
2. From another browser, execute multiple trades
3. Verify volume, trade count, and holder count update on the page within 2 seconds

## Phase 2 Validation

### V-2a: Holder count accuracy
1. Buy tokens with wallet A
2. Sell ALL tokens from wallet A
3. Wait for block confirmation
4. Verify holder count decreased by 1

### V-2b: Graduation events
1. Trade a token to graduation threshold
2. Verify token detail page shows graduated status
3. Verify listing page updates the token's badge
4. Verify migration progress events appear (P3)

### V-2c: Profile refresh
1. Open profile page
2. From another browser, trade on a held token
3. Verify price updates within 30 seconds

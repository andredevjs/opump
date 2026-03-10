# Quickstart Validation Scenarios

**Branch**: `1-opump-launchpad`

These scenarios validate end-to-end correctness at each phase gate.

## Phase 1 Gate — Core Loop

### Scenario 1: Deploy a Token
1. Connect OPWallet on testnet
2. Open `/launch`, complete all 6 wizard steps
3. Submit deployment
4. **Verify**: Token appears in `GET /v1/tokens` within one confirmed block
5. **Verify**: Token detail page at `/token/:addr` shows correct metadata

### Scenario 2: Buy Tokens
1. Navigate to a deployed token's page
2. Enter 100,000 sats in buy panel
3. Click "Simulate" — verify output, fees, price impact display
4. Click "Buy" — OPWallet prompts for signature
5. **Verify**: After confirmation, token balance increases in wallet
6. **Verify**: Trade appears in trade history with "confirmed" status
7. **Verify**: Token price moved up on the bonding curve

### Scenario 3: Sell Tokens
1. On same token page, switch to "Sell" tab
2. Enter half the tokens received from Scenario 2
3. Simulate → verify BTC output display
4. Execute sell
5. **Verify**: Token balance decreases, BTC balance increases
6. **Verify**: Price moved down

### Scenario 4: Minimum Trade Rejection
1. Try to buy with 5,000 sats (below 10,000 minimum)
2. **Verify**: UI shows error before submission
3. **Verify**: Contract reverts if somehow submitted

## Phase 2 Gate — Real-Time UX

### Scenario 5: Optimistic Price Update
1. Open token page in Browser A and Browser B
2. In Browser A, execute a buy
3. **Verify**: Browser B sees price update within 3 seconds with "~" prefix
4. **Verify**: After block confirmation, "~" prefix disappears

### Scenario 6: Dropped Transaction Rollback
1. Execute a buy with very low fee rate
2. **Verify**: Optimistic price shows in UI
3. If tx is dropped from mempool (RBF or timeout)
4. **Verify**: Price rolls back to previous value
5. **Verify**: Trade disappears from pending feed

## Phase 3 Gate — Discovery

### Scenario 7: Search and Filter
1. Open `/trenches` with 10+ tokens deployed
2. Search for a token by name → only matching tokens shown
3. Filter by "Active" → graduated tokens hidden
4. Sort by volume descending → highest volume first
5. **Verify**: All within 500ms response time

## Phase 4 Gate — Rewards

### Scenario 8: Minter Reward Claim
1. Buy tokens within first 4,320 blocks of a token's launch
2. Hold for 4,320 more blocks (use regtest to mine blocks)
3. Call `claimMinterReward()`
4. **Verify**: Receive proportional share of minter fee pool

### Scenario 9: Creator Fee Claim
1. As token creator, check accumulated fees after trading volume
2. Call `claimCreatorFees()`
3. **Verify**: Receive correct BTC amount

## Phase 5 Gate — Graduation

### Scenario 10: Graduation Trigger
1. Buy enough tokens to push `realBtcReserve` to 6,900,000 sats
2. **Verify**: Token status changes to "graduated"
3. **Verify**: Subsequent buy/sell attempts are blocked
4. **Verify**: UI shows "Graduated" badge and MotoSwap link

# Validation Scenarios: Token Holder Distribution

## Scenario 1: Fresh Token with Creator Allocation
1. Create a token with 5% creator allocation
2. GET `/api/v1/tokens/{addr}/holders`
3. **Expected**: 1 holder (creator), balance = 5% of initial supply, percent ≈ 100% of circulating

## Scenario 2: Multiple Buys from Different Wallets
1. Token with no creator allocation
2. Wallet A buys 10,000 tokens
3. Wallet B buys 5,000 tokens
4. Wallet C buys 2,500 tokens
5. GET holders endpoint
6. **Expected**: 3 holders, ordered A > B > C, percentages ≈ 57.1%, 28.6%, 14.3%

## Scenario 3: Full Sell Removes Holder
1. From Scenario 2 state, Wallet C sells all 2,500 tokens
2. GET holders endpoint
3. **Expected**: 2 holders (A, B only), Wallet C is gone, holderCount = 2

## Scenario 4: Partial Sell Updates Balance
1. Wallet A sells 3,000 of their 10,000 tokens
2. GET holders endpoint
3. **Expected**: A has 7,000, B has 5,000. A still #1 but at 58.3%, B at 41.7%

## Scenario 5: Token Info Tab Displays Correctly
1. Open token detail page, click Token Info tab
2. **Expected**: See "Holders" count and "Top Holders" list
3. List shows address (truncated) + percentage for each holder
4. Clicking address copies to clipboard

## Scenario 6: Mempool-First Update
1. Open Token Info tab for a token
2. Submit a buy trade from a new wallet
3. Wait for polling cycle (~5s)
4. **Expected**: New holder appears in list, holderCount increments, without page reload

## Scenario 7: Zero Holders (Edge)
1. Token just created with 0% creator allocation, no trades yet
2. GET holders endpoint
3. **Expected**: `{ holders: [], holderCount: 0, circulatingSupply: "0" }`
4. UI shows empty state message

## Scenario 8: More Than 10 Holders
1. 15 different wallets buy tokens in varying amounts
2. GET holders endpoint (default limit=10)
3. **Expected**: Only top 10 returned, but holderCount = 15

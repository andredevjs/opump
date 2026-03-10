# Smart Contract ABI Contracts

**Language**: AssemblyScript → WASM
**Runtime**: btc-runtime on OPNet

## OPNet Runtime Requirements (Bob MCP Mandatory)

### Entry Point Structure
Every contract WASM must export exactly three elements:
1. **Factory function** — creates the contract instance
2. **Runtime exports** — `__execute`, `__abort`, memory
3. **Abort handler** — custom abort function (NOT the default AS one)

### Critical Constraints
- **Buffer is REMOVED** — use `Uint8Array` everywhere (no `Buffer`, no `Buffer.from()`)
- **Contracts CANNOT hold BTC** — BTC flows via UTXOs in the transaction, not stored in contract. Fee pools (platform, creator, minter) track *amounts owed* as u256 counters; actual BTC payouts happen via transaction outputs verified by the contract
- **`@method()` must declare all params** — bare `@method()` is FORBIDDEN (requires redeployment to fix)
- **BytesWriter size must match actual data written** — over/under-allocation causes silent corruption
- **Must call `super.callMethod()`** in the default case of the method selector switch
- **SafeMath mandatory** — no raw `+`, `-`, `*`, `/` on u256

### ABI Method Flags (VM-Enforced)
| Flag | Meaning | Usage |
|------|---------|-------|
| `constant` | Read-only, no state mutation | `getReserves()`, `getPrice()`, `getConfig()`, `isGraduated()`, `getMinterInfo()`, `getReservation()` |
| `payable` | Accepts BTC value in transaction | `buy()`, `reserve()` |
| *(neither)* | Mutates state, no BTC value | `sell()`, `claimCreatorFees()`, `claimMinterReward()`, `cancelReservation()` |

### Package Dependencies
```json
{
  "@btc-vision/btc-runtime": "rc",
  "@btc-vision/as-bignum": "0.1.2",
  "@btc-vision/opnet-transform": "latest"
}
```
**CRITICAL**: Must use `@btc-vision/assemblyscript` (custom fork). Must uninstall upstream `assemblyscript` first if present.

---

## LaunchToken Contract (extends OP20)

### Constructor / Deployment

`onDeployment(calldata)` — called once at deploy time.

**Calldata params**:
| Name | Type | Description |
|------|------|-------------|
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `maxSupply` | u256 | Total supply (default: 1B * 10^8) |
| `creatorAllocationBps` | u256 | Creator allocation (0–1000) |
| `buyTaxBps` | u256 | Flywheel buy tax (0–300) |
| `sellTaxBps` | u256 | Flywheel sell tax (0–500) |
| `flywheelDestination` | u256 | 0=burn, 1=community, 2=creator |
| `graduationThreshold` | u256 | BTC sats for graduation (default: 6,900,000) |

**Behavior**:
1. Call `this.instantiate(OP20InitParameters)` with name, symbol, 8 decimals, maxSupply
2. Store all config in storage pointers
3. Set `deployBlock = Blockchain.block.number`
4. Calculate k = INITIAL_VIRTUAL_BTC * INITIAL_VIRTUAL_TOKEN
5. Mint creator allocation to `Blockchain.tx.origin`
6. Set virtual reserves to initial values

### Public Methods

#### `buy(btcAmount: u256)` → `{ tokensOut: u256 }`
Buy tokens from the bonding curve.

**Selector**: `encodeSelector('buy(uint256)')`

**Logic**:
1. Revert if `graduated == true`
2. Revert if `btcAmount < minTradeAmount`
3. Calculate fee: `totalFee = btcAmount * 15 / 1000` (1.5%)
4. Split fee: platform 1%, creator 0.25%, minter 0.25%
5. Calculate flywheel tax: `flywheelFee = btcAmount * buyTaxBps / 10000`
6. `netBtc = btcAmount - totalFee - flywheelFee`
7. `tokensOut = virtualTokenSupply - (kConstant / (virtualBtcReserve + netBtc))`
8. Update reserves: `virtualBtcReserve += netBtc`, `virtualTokenSupply -= tokensOut`
9. Update `realBtcReserve += netBtc`
10. `_mint(buyer, tokensOut)`
11. Track minter eligibility if within first 4,320 blocks
12. Check graduation threshold
13. Emit `BuyEvent`

#### `sell(tokenAmount: u256)` → `{ btcOut: u256 }`
Sell tokens back to the bonding curve.

**Selector**: `encodeSelector('sell(uint256)')`

**Logic**:
1. Revert if `graduated == true`
2. Revert if token equivalent < `minTradeAmount`
3. `btcOut = virtualBtcReserve - (kConstant / (virtualTokenSupply + tokenAmount))`
4. Calculate and split fees (same percentages)
5. `_burn(seller, tokenAmount)`
6. Update reserves
7. Emit `SellEvent`

#### `claimCreatorFees()` → `{ amount: u256 }`
Creator claims accumulated fees.

**Selector**: `encodeSelector('claimCreatorFees()')`

**Logic**:
1. Revert if `Blockchain.tx.sender != creator`
2. Read `creatorFeePool`
3. Set `creatorFeePool = 0`
4. Return amount (paid via BTC output in transaction)

#### `claimMinterReward()` → `{ amount: u256 }`
Minter claims their proportional share of the minter fee pool.

**Selector**: `encodeSelector('claimMinterReward()')`

**Logic**:
1. Check minter bought within first 4,320 blocks of deploy
2. Check current block >= minterBuyBlock + 4,320 (30-day hold)
3. Check minter still holds tokens (balance > 0)
4. Calculate share: `minterShares[sender] / totalMinterShares * minterFeePool`
5. Zero out minter's shares (prevent double claim)
6. Return amount

#### `reserve(btcAmount: u256)` → `{ expiryBlock: u256 }`
Lock a price for the two-transaction model.

**Selector**: `encodeSelector('reserve(uint256)')`

**Logic**:
1. Revert if already has active reservation
2. Store reservation: amount, expiry = currentBlock + 3
3. Emit `ReservationEvent`

#### `cancelReservation()` → `{ penalty: u256 }`
Cancel an active reservation with slashing.

**Selector**: `encodeSelector('cancelReservation()')`

**Logic**:
1. Calculate penalty (50% base, 90% if repeated)
2. Clear reservation
3. Return penalty amount

### Read-Only Methods

| Method | Selector | Returns |
|--------|----------|---------|
| `getReserves()` | `getReserves()` | `{ virtualBtc, virtualToken, realBtc, k }` |
| `getPrice()` | `getPrice()` | `{ priceSatsPerToken }` |
| `getConfig()` | `getConfig()` | `{ creatorBps, buyTax, sellTax, destination, threshold }` |
| `getMinterInfo(address)` | `getMinterInfo(address)` | `{ shares, buyBlock, eligible }` |
| `getReservation(address)` | `getReservation(address)` | `{ amount, expiryBlock }` |
| `isGraduated()` | `isGraduated()` | `{ graduated: bool }` |

### Events

| Event | Fields |
|-------|--------|
| `BuyEvent` | buyer, btcIn, tokensOut, newPrice |
| `SellEvent` | seller, tokensIn, btcOut, newPrice |
| `GraduationEvent` | tokenAddress, finalBtcReserve |
| `ReservationEvent` | user, amount, expiryBlock |
| `FeeClaimedEvent` | claimer, amount, feeType |

---

## OPumpFactory Contract (extends OP_NET)

### `deployToken(params)` → `{ tokenAddress: address }`
Deploy a new LaunchToken through the factory.

**Calldata params**:
| Name | Type | Description |
|------|------|-------------|
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `creatorAllocationBps` | u256 | 0–1000 |
| `buyTaxBps` | u256 | 0–300 |
| `sellTaxBps` | u256 | 0–500 |
| `flywheelDestination` | u256 | 0, 1, or 2 |

**Logic**:
1. Validate combined allocation <= 2500 bps (25%)
2. Deploy new LaunchToken contract
3. Register in tokenRegistry
4. Increment tokenCount
5. Emit `TokenDeployedEvent`

### Read-Only Methods

| Method | Returns |
|--------|---------|
| `getTokenCount()` | `{ count: u256 }` |
| `getTokenAtIndex(index)` | `{ address }` |
| `getTokensByCreator(creator)` | `{ addresses[] }` |
| `getStats()` | `{ totalTokens, totalGraduated, totalVolume }` |

### Events

| Event | Fields |
|-------|--------|
| `TokenDeployedEvent` | creator, tokenAddress, name, symbol |
| `TokenGraduatedEvent` | tokenAddress, finalReserve |

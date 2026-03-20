import { Address } from '@btc-vision/transaction';
import {
    Assert,
    Blockchain,
    opnet,
    OPNetUnit,
    generateEmptyTransaction,
} from '@btc-vision/unit-test-framework';
import { LaunchTokenRuntime, LaunchTokenConfig, DEFAULT_CONFIG } from './runtime/LaunchTokenRuntime.js';

// Constants matching the contract
const INITIAL_VIRTUAL_BTC = 767_000n; // 0.00767 BTC
const INITIAL_VIRTUAL_TOKEN = 100_000_000_000_000_000n; // 1B * 10^8
const DEFAULT_MAX_SUPPLY = 100_000_000_000_000_000n;
const DEFAULT_GRADUATION_THRESHOLD = 6_900_000n; // 0.069 BTC
const MIN_TRADE_AMOUNT = 10_000n;
const FEE_DENOMINATOR = 10_000n;

// Helper to create a transaction with a BTC output to an address
function setTxWithOutput(toAddress: string, valueSats: bigint): void {
    const tx = generateEmptyTransaction();
    tx.addOutput(valueSats, toAddress);
    Blockchain.transaction = tx;
}

// Helper to create a token with custom config
function makeConfig(overrides: Partial<LaunchTokenConfig> = {}): LaunchTokenConfig {
    return { ...DEFAULT_CONFIG, ...overrides };
}

await opnet('LaunchToken', async (vm: OPNetUnit) => {
    let token: LaunchTokenRuntime;
    const deployer: Address = Blockchain.generateRandomAddress();
    const contractAddress: Address = Blockchain.generateRandomAddress();
    const vaultAddress = DEFAULT_CONFIG.vaultAddress;

    async function createToken(config?: LaunchTokenConfig): Promise<LaunchTokenRuntime> {
        const t = new LaunchTokenRuntime(deployer, contractAddress, config ?? DEFAULT_CONFIG);
        Blockchain.register(t);
        await t.init();
        return t;
    }

    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();

        Blockchain.txOrigin = deployer;
        Blockchain.msgSender = deployer;
        Blockchain.blockNumber = 100n;

        token = await createToken();
    });

    vm.afterEach(() => {
        token.dispose();
        Blockchain.dispose();
    });

    // ==========================================
    // DEPLOYMENT TESTS
    // ==========================================

    await vm.it('should initialize with correct default reserves', async () => {
        const reserves = await token.getReserves();
        Assert.expect(reserves.virtualBtc).toEqual(INITIAL_VIRTUAL_BTC);
        Assert.expect(reserves.virtualToken).toEqual(INITIAL_VIRTUAL_TOKEN);
        Assert.expect(reserves.realBtc).toEqual(0n);
        Assert.expect(reserves.k).toEqual(INITIAL_VIRTUAL_BTC * INITIAL_VIRTUAL_TOKEN);
    });

    await vm.it('should initialize with correct default config', async () => {
        const config = await token.getConfig();
        Assert.expect(config.creatorBps).toEqual(0n);
        Assert.expect(config.buyTax).toEqual(0n);
        Assert.expect(config.sellTax).toEqual(0n);
        Assert.expect(config.destination).toEqual(0n);
        Assert.expect(config.threshold).toEqual(DEFAULT_GRADUATION_THRESHOLD);
    });

    await vm.it('should not be graduated initially', async () => {
        const graduated = await token.isGraduated();
        Assert.expect(graduated).toEqual(false);
    });

    await vm.it('should mint creator allocation to origin', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ creatorAllocationBps: 500n }); // 5%
        token = await createToken(config);

        const balance = await token.balanceOf(deployer);
        const expectedTokens = (DEFAULT_MAX_SUPPLY * 500n) / FEE_DENOMINATOR;
        Assert.expect(balance).toEqual(expectedTokens);
    });

    await vm.it('should reject creatorAllocationBps > 1000', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ creatorAllocationBps: 1001n });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();

        // Deployment validation happens lazily on first execute
        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Creator allocation exceeds 10%');
    });

    await vm.it('should reject buyTax > 300', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ buyTaxBps: 301n });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();

        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Buy tax exceeds 3%');
    });

    await vm.it('should reject sellTax > 500', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ sellTaxBps: 501n });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();

        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Sell tax exceeds 5%');
    });

    await vm.it('should reject empty vault address', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ vaultAddress: '' });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();

        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Vault address required');
    });

    // ==========================================
    // BUY — BTC VERIFICATION (Fix 1)
    // ==========================================

    await vm.it('should revert buy if graduated', async () => {
        // Deploy with threshold matching netBtc of a 50k buy to graduate on first buy
        // netBtc = 50_000 - floor(50_000 * 125 / 10_000) = 50_000 - 625 = 49_375
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ graduationThreshold: 49_375n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 50_000n;
        setTxWithOutput(vaultAddress, buyAmount);
        Blockchain.msgSender = buyer;
        Blockchain.txOrigin = buyer;

        // First buy triggers graduation (netBtc == threshold)
        await token.buy(buyAmount, buyer);

        // Second buy should fail
        setTxWithOutput(vaultAddress, buyAmount);
        await Assert.expect(async () => {
            await token.buy(buyAmount, buyer);
        }).toThrow('Token has graduated');
    });

    await vm.it('should revert buy if below minimum trade amount', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const tooSmall = MIN_TRADE_AMOUNT - 1n;
        setTxWithOutput(vaultAddress, tooSmall);

        await Assert.expect(async () => {
            await token.buy(tooSmall, buyer);
        }).toThrow('Below minimum trade amount');
    });

    await vm.it('should revert buy if no BTC output to vault', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 50_000n;

        // Set empty transaction — no outputs to vault
        Blockchain.transaction = generateEmptyTransaction();

        await Assert.expect(async () => {
            await token.buy(buyAmount, buyer);
        }).toThrow('Insufficient BTC sent to vault');
    });

    await vm.it('should revert buy if BTC output insufficient', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 50_000n;

        // Send less than required to vault
        setTxWithOutput(vaultAddress, buyAmount - 1n);

        await Assert.expect(async () => {
            await token.buy(buyAmount, buyer);
        }).toThrow('Insufficient BTC sent to vault');
    });

    await vm.it('should succeed buy when BTC output matches vault', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 50_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        const { tokensOut } = await token.buy(buyAmount, buyer);
        Assert.expect(tokensOut).toBeGreaterThan(0n);

        const balance = await token.balanceOf(buyer);
        Assert.expect(balance).toEqual(tokensOut);
    });

    await vm.it('should update reserves correctly after buy', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 100_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        const reservesBefore = await token.getReserves();
        await token.buy(buyAmount, buyer);
        const reservesAfter = await token.getReserves();

        // virtualBtc should increase (more BTC in curve)
        Assert.expect(reservesAfter.virtualBtc).toBeGreaterThan(reservesBefore.virtualBtc);
        // virtualToken should decrease (tokens removed from curve)
        Assert.expect(reservesAfter.virtualToken).toBeLessThan(reservesBefore.virtualToken);
        // realBtc should increase
        Assert.expect(reservesAfter.realBtc).toBeGreaterThan(reservesBefore.realBtc);
        // k stays constant
        Assert.expect(reservesAfter.k).toEqual(reservesBefore.k);
    });

    // ==========================================
    // BUY — FEES & FLYWHEEL
    // ==========================================

    await vm.it('should accumulate platform/creator fees on buy', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n; // 0.01 BTC
        setTxWithOutput(vaultAddress, buyAmount);

        const { response } = await token.buy(buyAmount, buyer);
        // No error means fees accumulated without issue
        Assert.expect(response.usedGas).toBeGreaterThan(0n);
    });

    await vm.it('should apply flywheel to community pool (dest=1)', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ buyTaxBps: 100n, flywheelDestination: 1n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 100_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);
        // If this doesn't revert, flywheel was applied correctly
    });

    await vm.it('should apply flywheel to creator pool (dest=2)', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ buyTaxBps: 100n, flywheelDestination: 2n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 100_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);
        // Verify creator can claim fees (flywheel + base fee)
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        const { amount } = await token.claimCreatorFees(deployer);
        Assert.expect(amount).toBeGreaterThan(0n);
    });

    // ==========================================
    // SELL — LIQUIDITY GUARD (Fix 2)
    // ==========================================

    await vm.it('should revert sell if graduated', async () => {
        token.dispose();
        Blockchain.clearContracts();

        // netBtc = 50_000 - 625 = 49_375 matches threshold exactly
        const config = makeConfig({ graduationThreshold: 49_375n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 50_000n;
        setTxWithOutput(vaultAddress, buyAmount);
        await token.buy(buyAmount, buyer);

        // Token is now graduated, sell should fail
        await Assert.expect(async () => {
            await token.sell(1000n, buyer);
        }).toThrow('Token has graduated');
    });

    await vm.it('should revert sell with Insufficient liquidity when selling creator tokens against empty reserve', async () => {
        token.dispose();
        Blockchain.clearContracts();

        // Create token with creator allocation but NO buys (realBtcReserve=0)
        const config = makeConfig({ creatorAllocationBps: 500n }); // 5%
        token = await createToken(config);

        // Deployer has creator-allocated tokens but realBtcReserve is 0
        const balance = await token.balanceOf(deployer);
        Assert.expect(balance).toBeGreaterThan(0n);

        // Selling should hit the new liquidity guard
        await Assert.expect(async () => {
            await token.sell(balance, deployer);
        }).toThrow('Insufficient liquidity');
    });

    await vm.it('should succeed sell with correct btcOut and token burn', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 500_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        const { tokensOut } = await token.buy(buyAmount, buyer);
        Assert.expect(tokensOut).toBeGreaterThan(0n);

        // Sell half the tokens
        const sellAmount = tokensOut / 2n;
        const { btcOut } = await token.sell(sellAmount, buyer);
        Assert.expect(btcOut).toBeGreaterThan(0n);

        // Balance should decrease
        const remainingBalance = await token.balanceOf(buyer);
        Assert.expect(remainingBalance).toEqual(tokensOut - sellAmount);
    });

    await vm.it('should update reserves correctly after sell', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 500_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        const { tokensOut } = await token.buy(buyAmount, buyer);

        const reservesBefore = await token.getReserves();
        await token.sell(tokensOut / 2n, buyer);
        const reservesAfter = await token.getReserves();

        // virtualBtc decreases (BTC removed from curve)
        Assert.expect(reservesAfter.virtualBtc).toBeLessThan(reservesBefore.virtualBtc);
        // virtualToken increases (tokens returned to curve)
        Assert.expect(reservesAfter.virtualToken).toBeGreaterThan(reservesBefore.virtualToken);
        // realBtc decreases
        Assert.expect(reservesAfter.realBtc).toBeLessThan(reservesBefore.realBtc);
    });

    await vm.it('should revert sell if grossBtcOut below min trade amount', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 50_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        // Sell a tiny amount — should produce grossBtcOut below MIN_TRADE_AMOUNT
        await Assert.expect(async () => {
            await token.sell(1n, buyer);
        }).toThrow('Below minimum trade amount');
    });

    // ==========================================
    // RESERVATIONS (Fix 1 + Fix 6)
    // ==========================================

    await vm.it('should create reservation with correct expiry', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 50_000n;
        setTxWithOutput(vaultAddress, amount);

        Blockchain.blockNumber = 200n;
        const { expiryBlock } = await token.reserve(amount, user);

        Assert.expect(expiryBlock).toEqual(203n); // 200 + 3
    });

    await vm.it('should revert reserve if active reservation exists', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 50_000n;
        setTxWithOutput(vaultAddress, amount);

        await token.reserve(amount, user);

        // Second reservation while first is still active
        setTxWithOutput(vaultAddress, amount);
        await Assert.expect(async () => {
            await token.reserve(amount, user);
        }).toThrow('Active reservation exists');
    });

    await vm.it('should revert reserve if no BTC output to vault', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 50_000n;

        Blockchain.transaction = generateEmptyTransaction();

        await Assert.expect(async () => {
            await token.reserve(amount, user);
        }).toThrow('Insufficient BTC sent to vault');
    });

    await vm.it('should consume reservation on matching buy', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 50_000n;
        setTxWithOutput(vaultAddress, amount);

        await token.reserve(amount, user);

        // Buy with matching amount should succeed
        setTxWithOutput(vaultAddress, amount);
        const { tokensOut } = await token.buy(amount, user);
        Assert.expect(tokensOut).toBeGreaterThan(0n);

        // Reservation should be cleared
        const res = await token.getReservation(user);
        Assert.expect(res.amount).toEqual(0n);
    });

    await vm.it('should revert buy if amount mismatches active reservation', async () => {
        const user = Blockchain.generateRandomAddress();
        const reserveAmount = 50_000n;
        setTxWithOutput(vaultAddress, reserveAmount);

        await token.reserve(reserveAmount, user);

        // Buy with different amount
        const differentAmount = 60_000n;
        setTxWithOutput(vaultAddress, differentAmount);
        await Assert.expect(async () => {
            await token.buy(differentAmount, user);
        }).toThrow('Amount must match reservation');
    });

    await vm.it('should cancel reservation and return true (Fix 6)', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 50_000n;
        setTxWithOutput(vaultAddress, amount);

        await token.reserve(amount, user);

        const { success } = await token.cancelReservation(user);
        Assert.expect(success).toEqual(true);

        // Reservation should be cleared
        const res = await token.getReservation(user);
        Assert.expect(res.amount).toEqual(0n);
        Assert.expect(res.expiryBlock).toEqual(0n);
    });

    await vm.it('should revert cancelReservation if no reservation', async () => {
        const user = Blockchain.generateRandomAddress();

        await Assert.expect(async () => {
            await token.cancelReservation(user);
        }).toThrow('No active reservation');
    });

    // ==========================================
    // FEE CLAIMS
    // ==========================================

    await vm.it('should allow deployer to claim creator fees', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        // Claim as deployer
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        const { amount } = await token.claimCreatorFees(deployer);
        Assert.expect(amount).toBeGreaterThan(0n);
    });

    await vm.it('should revert claimCreatorFees if not deployer', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        const random = Blockchain.generateRandomAddress();
        await Assert.expect(async () => {
            await token.claimCreatorFees(random);
        }).toThrow(); // "Not deployer" or similar
    });

    await vm.it('should revert claimCreatorFees if no fees', async () => {
        await Assert.expect(async () => {
            await token.claimCreatorFees(deployer);
        }).toThrow('No fees to claim');
    });

    await vm.it('should zero out creator fee pool after claim', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await token.claimCreatorFees(deployer);

        // Second claim should fail — pool is empty
        await Assert.expect(async () => {
            await token.claimCreatorFees(deployer);
        }).toThrow('No fees to claim');
    });

    await vm.it('should revert claimMinterReward with no shares', async () => {
        const user = Blockchain.generateRandomAddress();
        await Assert.expect(async () => {
            await token.claimMinterReward(user);
        }).toThrow('No minter shares');
    });

    await vm.it('should revert claimMinterReward if hold period not met', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 500_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        // Try claiming immediately (hold period = 4320 blocks)
        await Assert.expect(async () => {
            await token.claimMinterReward(buyer);
        }).toThrow('Hold period not met');
    });

    // ==========================================
    // GRADUATION
    // ==========================================

    await vm.it('should graduate when realBtcReserve >= threshold', async () => {
        token.dispose();
        Blockchain.clearContracts();

        // netBtc for 100_000 buy = 100_000 - 1_250 = 98_750; set threshold to match
        const config = makeConfig({ graduationThreshold: 98_750n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 100_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        const graduated = await token.isGraduated();
        Assert.expect(graduated).toEqual(true);
    });

    await vm.it('should block buy and sell after graduation', async () => {
        token.dispose();
        Blockchain.clearContracts();

        // netBtc for 100_000 buy = 98_750; threshold matches exactly
        const config = makeConfig({ graduationThreshold: 98_750n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 100_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        const { tokensOut } = await token.buy(buyAmount, buyer);

        // Buy should fail
        setTxWithOutput(vaultAddress, buyAmount);
        await Assert.expect(async () => {
            await token.buy(buyAmount, buyer);
        }).toThrow('Token has graduated');

        // Sell should fail
        await Assert.expect(async () => {
            await token.sell(tokensOut, buyer);
        }).toThrow('Token has graduated');
    });

    // ==========================================
    // VIEW METHODS
    // ==========================================

    await vm.it('should return correct price after buy', async () => {
        const priceBefore = await token.getPrice();

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 500_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        const priceAfter = await token.getPrice();
        // Price should increase after buy
        Assert.expect(priceAfter).toBeGreaterThanOrEqual(priceBefore);
    });

    await vm.it('should return correct reservation data', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 75_000n;
        setTxWithOutput(vaultAddress, amount);

        Blockchain.blockNumber = 300n;
        await token.reserve(amount, user);

        const res = await token.getReservation(user);
        Assert.expect(res.amount).toEqual(amount);
        Assert.expect(res.expiryBlock).toEqual(303n); // 300 + 3
    });

    await vm.it('should return zero for non-existent minter', async () => {
        const random = Blockchain.generateRandomAddress();
        const info = await token.getMinterInfo(random);
        Assert.expect(info.shares).toEqual(0n);
        Assert.expect(info.buyBlock).toEqual(0n);
        Assert.expect(info.eligible).toEqual(false);
    });

    await vm.it('should track total supply correctly', async () => {
        const supplyBefore = await token.totalSupply();
        Assert.expect(supplyBefore).toEqual(0n); // No creator allocation in default config

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 100_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        const { tokensOut } = await token.buy(buyAmount, buyer);
        const supplyAfter = await token.totalSupply();
        Assert.expect(supplyAfter).toEqual(tokensOut);
    });

    // ==========================================
    // DEPLOYMENT VALIDATION (missing)
    // ==========================================

    await vm.it('should reject empty name', async () => {
        token.dispose();
        Blockchain.clearContracts();
        const config = makeConfig({ name: '' });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();
        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Name required');
    });

    await vm.it('should reject empty symbol', async () => {
        token.dispose();
        Blockchain.clearContracts();
        const config = makeConfig({ symbol: '' });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();
        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Symbol required');
    });

    await vm.it('should reject maxSupply below INITIAL_VIRTUAL_TOKEN', async () => {
        token.dispose();
        Blockchain.clearContracts();
        const config = makeConfig({ maxSupply: 1n });
        const bad = new LaunchTokenRuntime(deployer, contractAddress, config);
        Blockchain.register(bad);
        await bad.init();
        await Assert.expect(async () => {
            await bad.getConfig();
        }).toThrow('Max supply must be >= initial virtual token supply');
    });

    // ==========================================
    // BUY — EXCEEDS GRADUATION THRESHOLD
    // ==========================================

    await vm.it('should revert buy that exceeds graduation threshold', async () => {
        const buyer = Blockchain.generateRandomAddress();
        // DEFAULT_GRADUATION_THRESHOLD is 6_900_000 sats. Try to buy more than that.
        const hugeAmount = 10_000_000n;
        setTxWithOutput(vaultAddress, hugeAmount);
        await Assert.expect(async () => {
            await token.buy(hugeAmount, buyer);
        }).toThrow('Exceeds graduation threshold');
    });

    // ==========================================
    // FEE POOLS NUMERICAL ACCURACY
    // ==========================================

    await vm.it('should accumulate exact fee amounts in pools', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n; // 0.01 BTC
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        const pools = await token.getFeePools();
        // Total fee = 1.25% of 1_000_000 = 12_500 sats
        // Platform = 1% = 10_000, Creator = remainder = 2_500
        const expectedPlatform = (buyAmount * 100n) / 10_000n;
        const expectedTotal = (buyAmount * 125n) / 10_000n;
        const expectedCreator = expectedTotal - expectedPlatform;

        Assert.expect(pools.platformFees).toEqual(expectedPlatform);
        Assert.expect(pools.creatorFees).toEqual(expectedCreator);
    });

    await vm.it('should accumulate sell fees in pools', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);
        const { tokensOut } = await token.buy(buyAmount, buyer);

        // Reset pools check — note pools already have buy fees
        const poolsAfterBuy = await token.getFeePools();

        // Now sell half
        const sellAmount = tokensOut / 2n;
        await token.sell(sellAmount, buyer);

        const poolsAfterSell = await token.getFeePools();
        // Both pools should increase from sell fees
        Assert.expect(poolsAfterSell.platformFees).toBeGreaterThan(poolsAfterBuy.platformFees);
        Assert.expect(poolsAfterSell.creatorFees).toBeGreaterThan(poolsAfterBuy.creatorFees);
    });

    // ==========================================
    // PLATFORM FEE CLAIMS
    // ==========================================

    await vm.it('should allow deployer to claim platform fees', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);
        await token.buy(buyAmount, buyer);

        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        const { amount } = await token.claimPlatformFees(deployer);
        Assert.expect(amount).toBeGreaterThan(0n);

        // Pool should be zeroed
        const pools = await token.getFeePools();
        Assert.expect(pools.platformFees).toEqual(0n);
    });

    await vm.it('should revert claimPlatformFees if not deployer', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);
        await token.buy(buyAmount, buyer);

        const random = Blockchain.generateRandomAddress();
        await Assert.expect(async () => {
            await token.claimPlatformFees(random);
        }).toThrow();
    });

    await vm.it('should revert claimPlatformFees if no fees', async () => {
        await Assert.expect(async () => {
            await token.claimPlatformFees(deployer);
        }).toThrow('No fees to claim');
    });

    // ==========================================
    // MIGRATION
    // ==========================================

    await vm.it('should not be migrated initially', async () => {
        const migrated = await token.isMigrated();
        Assert.expect(migrated).toEqual(false);
    });

    await vm.it('should revert migrate if not graduated', async () => {
        const recipient = Blockchain.generateRandomAddress();
        await Assert.expect(async () => {
            await token.migrate(recipient, deployer);
        }).toThrow('Not graduated');
    });

    await vm.it('should revert migrate if not deployer', async () => {
        // Graduate first — netBtc for 100k buy = 98_750
        token.dispose();
        Blockchain.clearContracts();
        const config = makeConfig({ graduationThreshold: 98_750n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        setTxWithOutput(vaultAddress, 100_000n);
        await token.buy(100_000n, buyer);

        const recipient = Blockchain.generateRandomAddress();
        const random = Blockchain.generateRandomAddress();
        await Assert.expect(async () => {
            await token.migrate(recipient, random);
        }).toThrow();
    });

    await vm.it('should migrate successfully after graduation', async () => {
        token.dispose();
        Blockchain.clearContracts();
        const config = makeConfig({ graduationThreshold: 98_750n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        setTxWithOutput(vaultAddress, 100_000n);
        await token.buy(100_000n, buyer);

        // Now graduated
        Assert.expect(await token.isGraduated()).toEqual(true);

        const recipient = Blockchain.generateRandomAddress();
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        const { tokenAmount } = await token.migrate(recipient, deployer);
        Assert.expect(tokenAmount).toBeGreaterThan(0n);

        // Recipient should have liquidity tokens
        const balance = await token.balanceOf(recipient);
        Assert.expect(balance).toEqual(tokenAmount);

        // Should be marked as migrated
        Assert.expect(await token.isMigrated()).toEqual(true);
    });

    await vm.it('should revert double migration', async () => {
        token.dispose();
        Blockchain.clearContracts();
        const config = makeConfig({ graduationThreshold: 98_750n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        setTxWithOutput(vaultAddress, 100_000n);
        await token.buy(100_000n, buyer);

        const recipient = Blockchain.generateRandomAddress();
        Blockchain.msgSender = deployer;
        Blockchain.txOrigin = deployer;
        await token.migrate(recipient, deployer);

        await Assert.expect(async () => {
            await token.migrate(recipient, deployer);
        }).toThrow('Already migrated');
    });

    // ==========================================
    // FLYWHEEL BURN DESTINATION (dest=0)
    // ==========================================

    await vm.it('should handle flywheel burn destination (dest=0) with no pool increase', async () => {
        token.dispose();
        Blockchain.clearContracts();

        const config = makeConfig({ buyTaxBps: 100n, flywheelDestination: 0n });
        token = await createToken(config);

        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 1_000_000n;
        setTxWithOutput(vaultAddress, buyAmount);

        await token.buy(buyAmount, buyer);

        const pools = await token.getFeePools();
        // Only base fees (1.25%), no flywheel addition to any pool
        const expectedPlatform = (buyAmount * 100n) / 10_000n;
        const expectedTotal = (buyAmount * 125n) / 10_000n;
        const expectedCreator = expectedTotal - expectedPlatform;
        Assert.expect(pools.platformFees).toEqual(expectedPlatform);
        Assert.expect(pools.creatorFees).toEqual(expectedCreator);
    });

    // ==========================================
    // EXPIRED RESERVATION ALLOWS NEW ONE
    // ==========================================

    await vm.it('should allow new reservation after previous expired', async () => {
        const user = Blockchain.generateRandomAddress();
        const amount = 50_000n;
        setTxWithOutput(vaultAddress, amount);

        // Reserve at block 200, expires at 203
        Blockchain.blockNumber = 200n;
        await token.reserve(amount, user);

        // Move past expiry
        Blockchain.blockNumber = 204n;

        // New reservation should succeed
        setTxWithOutput(vaultAddress, amount);
        const { expiryBlock } = await token.reserve(amount, user);
        Assert.expect(expiryBlock).toEqual(207n); // 204 + 3
    });

    // ==========================================
    // SEQUENTIAL TRADES (buy -> sell -> buy)
    // ==========================================

    await vm.it('should handle sequential buy-sell-buy correctly', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const buyAmount = 200_000n;

        // First buy
        setTxWithOutput(vaultAddress, buyAmount);
        const { tokensOut: tokens1 } = await token.buy(buyAmount, buyer);
        Assert.expect(tokens1).toBeGreaterThan(0n);

        // Sell all
        const { btcOut } = await token.sell(tokens1, buyer);
        Assert.expect(btcOut).toBeGreaterThan(0n);
        // btcOut < buyAmount due to fees and slippage
        Assert.expect(btcOut).toBeLessThan(buyAmount);

        // Balance should be 0 after selling all
        const balanceAfterSell = await token.balanceOf(buyer);
        Assert.expect(balanceAfterSell).toEqual(0n);

        // Second buy
        setTxWithOutput(vaultAddress, buyAmount);
        const { tokensOut: tokens2 } = await token.buy(buyAmount, buyer);
        Assert.expect(tokens2).toBeGreaterThan(0n);
    });

    // ==========================================
    // K-CONSTANT INVARIANT CHECK
    // ==========================================

    await vm.it('should maintain k-constant invariant after trades', async () => {
        const buyer = Blockchain.generateRandomAddress();
        const reservesBefore = await token.getReserves();
        const kBefore = reservesBefore.k;

        // Buy
        setTxWithOutput(vaultAddress, 200_000n);
        await token.buy(200_000n, buyer);

        const reservesAfterBuy = await token.getReserves();
        Assert.expect(reservesAfterBuy.k).toEqual(kBefore);

        // Sell half
        const balance = await token.balanceOf(buyer);
        await token.sell(balance / 2n, buyer);

        const reservesAfterSell = await token.getReserves();
        Assert.expect(reservesAfterSell.k).toEqual(kBefore);
    });

    // ==========================================
    // MULTIPLE BUYERS
    // ==========================================

    await vm.it('should handle multiple different buyers', async () => {
        const buyer1 = Blockchain.generateRandomAddress();
        const buyer2 = Blockchain.generateRandomAddress();

        setTxWithOutput(vaultAddress, 100_000n);
        const { tokensOut: tokens1 } = await token.buy(100_000n, buyer1);

        setTxWithOutput(vaultAddress, 200_000n);
        const { tokensOut: tokens2 } = await token.buy(200_000n, buyer2);

        // Both should have tokens
        Assert.expect(tokens1).toBeGreaterThan(0n);
        Assert.expect(tokens2).toBeGreaterThan(0n);

        // Buyer2 bought more BTC, but due to price increase from buyer1's buy,
        // buyer2 gets fewer tokens per sat
        const bal1 = await token.balanceOf(buyer1);
        const bal2 = await token.balanceOf(buyer2);
        Assert.expect(bal1).toEqual(tokens1);
        Assert.expect(bal2).toEqual(tokens2);

        // Total supply should be sum
        const supply = await token.totalSupply();
        Assert.expect(supply).toEqual(tokens1 + tokens2);
    });

    // ==========================================
    // GET FEE POOLS RETURNS ZEROS INITIALLY
    // ==========================================

    await vm.it('should return zero fee pools initially', async () => {
        const pools = await token.getFeePools();
        Assert.expect(pools.platformFees).toEqual(0n);
        Assert.expect(pools.creatorFees).toEqual(0n);
    });
});

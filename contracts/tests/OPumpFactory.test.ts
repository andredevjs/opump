import { Address } from '@btc-vision/transaction';
import { Assert, Blockchain, opnet, OPNetUnit } from '@btc-vision/unit-test-framework';
import { OPumpFactoryRuntime } from './runtime/OPumpFactoryRuntime.js';

await opnet('OPumpFactory', async (vm: OPNetUnit) => {
    let factory: OPumpFactoryRuntime;
    const deployer: Address = Blockchain.generateRandomAddress();
    const factoryAddress: Address = Blockchain.generateRandomAddress();

    vm.beforeEach(async () => {
        Blockchain.dispose();
        Blockchain.clearContracts();
        await Blockchain.init();

        factory = new OPumpFactoryRuntime(deployer, factoryAddress);
        Blockchain.register(factory);
        await factory.init();

        Blockchain.txOrigin = deployer;
        Blockchain.msgSender = deployer;
    });

    vm.afterEach(() => {
        factory.dispose();
        Blockchain.dispose();
    });

    // --- Registration ---

    await vm.it('should register first token and return index 0', async () => {
        const { tokenIndex } = await factory.registerToken('Token', 'TK', 0n, 0n, 0n, 0n, 0n, deployer);
        Assert.expect(tokenIndex).toEqual(0n);
    });

    await vm.it('should increment token count after registration', async () => {
        await factory.registerToken('Token', 'TK', 0n, 0n, 0n, 0n, 0n, deployer);
        const count = await factory.getTokenCount();
        Assert.expect(count).toEqual(1n);
    });

    await vm.it('should return sequential indices for multiple registrations', async () => {
        const { tokenIndex: idx0 } = await factory.registerToken('A', 'A', 0n, 0n, 0n, 0n, 0n, deployer);
        const { tokenIndex: idx1 } = await factory.registerToken('B', 'B', 0n, 0n, 0n, 0n, 0n, deployer);
        Assert.expect(idx0).toEqual(0n);
        Assert.expect(idx1).toEqual(1n);

        const count = await factory.getTokenCount();
        Assert.expect(count).toEqual(2n);
    });

    await vm.it('should track creator token count', async () => {
        await factory.registerToken('A', 'A', 0n, 0n, 0n, 0n, 0n, deployer);
        await factory.registerToken('B', 'B', 0n, 0n, 0n, 0n, 0n, deployer);

        const creatorCount = await factory.getTokensByCreator(deployer);
        Assert.expect(creatorCount).toEqual(2n);
    });

    await vm.it('should reject airdrop exceeding max', async () => {
        await Assert.expect(async () => {
            // 7001 > 7000 MAX_AIRDROP_BPS
            await factory.registerToken('Bad', 'BAD', 0n, 7001n, 0n, 0n, 0n, deployer);
        }).toThrow('Airdrop exceeds max');
    });

    await vm.it('should reject combined allocation > 7000 bps', async () => {
        await Assert.expect(async () => {
            // 4000 + 3500 = 7500 > 7000 MAX_COMBINED_ALLOCATION_BPS
            await factory.registerToken('Bad', 'BAD', 4000n, 3500n, 0n, 0n, 0n, deployer);
        }).toThrow('Combined allocation exceeds 70%');
    });

    await vm.it('should reject buyTax > 300 bps', async () => {
        await Assert.expect(async () => {
            await factory.registerToken('Bad', 'BAD', 0n, 0n, 301n, 0n, 0n, deployer);
        }).toThrow('Buy tax exceeds 3%');
    });

    await vm.it('should reject sellTax > 500 bps', async () => {
        await Assert.expect(async () => {
            await factory.registerToken('Bad', 'BAD', 0n, 0n, 0n, 501n, 0n, deployer);
        }).toThrow('Sell tax exceeds 5%');
    });

    await vm.it('should reject invalid flywheel destination > 2', async () => {
        await Assert.expect(async () => {
            await factory.registerToken('Bad', 'BAD', 0n, 0n, 0n, 0n, 3n, deployer);
        }).toThrow('Invalid flywheel destination');
    });

    // --- View Methods ---

    await vm.it('should return correct token creator at index', async () => {
        await factory.registerToken('Token', 'TK', 0n, 0n, 0n, 0n, 0n, deployer);
        const creator = await factory.getTokenAtIndex(0n);
        Assert.expect(creator).toBeGreaterThan(0n); // Non-zero = address stored
    });

    await vm.it('should track multiple creators independently', async () => {
        const creator2 = Blockchain.generateRandomAddress();

        await factory.registerToken('A', 'A', 0n, 0n, 0n, 0n, 0n, deployer);
        await factory.registerToken('B', 'B', 0n, 0n, 0n, 0n, 0n, creator2);

        const count1 = await factory.getTokensByCreator(deployer);
        const count2 = await factory.getTokensByCreator(creator2);
        Assert.expect(count1).toEqual(1n);
        Assert.expect(count2).toEqual(1n);
    });

    await vm.it('should return correct stats', async () => {
        await factory.registerToken('A', 'A', 0n, 0n, 0n, 0n, 0n, deployer);
        await factory.registerToken('B', 'B', 0n, 0n, 0n, 0n, 0n, deployer);

        const stats = await factory.getStats();
        Assert.expect(stats.totalTokens).toEqual(2n);
        Assert.expect(stats.totalGraduated).toEqual(0n);
        Assert.expect(stats.totalVolume).toEqual(0n);
    });
});

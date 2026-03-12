import { Address, BinaryReader, BinaryWriter } from '@btc-vision/transaction';
import { BytecodeManager, CallResponse, ContractRuntime } from '@btc-vision/unit-test-framework';

export interface LaunchTokenConfig {
    name: string;
    symbol: string;
    maxSupply: bigint;
    creatorAllocationBps: bigint;
    buyTaxBps: bigint;
    sellTaxBps: bigint;
    flywheelDestination: bigint;
    graduationThreshold: bigint;
    vaultAddress: string;
}

export const DEFAULT_CONFIG: LaunchTokenConfig = {
    name: 'TestToken',
    symbol: 'TT',
    maxSupply: 0n, // uses default
    creatorAllocationBps: 0n,
    buyTaxBps: 0n,
    sellTaxBps: 0n,
    flywheelDestination: 0n,
    graduationThreshold: 0n, // uses default
    vaultAddress: 'bc1pdefaultvaultaddressfortesting000000000000000000000000smqkv5',
};

function buildDeploymentCalldata(config: LaunchTokenConfig): Buffer {
    const w = new BinaryWriter();
    w.writeStringWithLength(config.name);
    w.writeStringWithLength(config.symbol);
    w.writeU256(config.maxSupply);
    w.writeU256(config.creatorAllocationBps);
    w.writeU256(config.buyTaxBps);
    w.writeU256(config.sellTaxBps);
    w.writeU256(config.flywheelDestination);
    w.writeU256(config.graduationThreshold);
    w.writeStringWithLength(config.vaultAddress);
    return w.getBuffer();
}

export class LaunchTokenRuntime extends ContractRuntime {
    // Selectors
    private readonly buySelector = this.getSelector('buy(uint256)');
    private readonly sellSelector = this.getSelector('sell(uint256)');
    private readonly reserveSelector = this.getSelector('reserve(uint256)');
    private readonly cancelReservationSelector = this.getSelector('cancelReservation()');
    private readonly claimPlatformFeesSelector = this.getSelector('claimPlatformFees()');
    private readonly claimCreatorFeesSelector = this.getSelector('claimCreatorFees()');
    private readonly claimMinterRewardSelector = this.getSelector('claimMinterReward()');
    private readonly getReservesSelector = this.getSelector('getReserves()');
    private readonly getPriceSelector = this.getSelector('getPrice()');
    private readonly getConfigSelector = this.getSelector('getConfig()');
    private readonly isGraduatedSelector = this.getSelector('isGraduated()');
    private readonly getMinterInfoSelector = this.getSelector('getMinterInfo(address)');
    private readonly getReservationSelector = this.getSelector('getReservation(address)');
    private readonly balanceOfSelector = this.getSelector('balanceOf(address)');
    private readonly totalSupplySelector = this.getSelector('totalSupply()');

    public constructor(
        deployer: Address,
        address: Address,
        config: LaunchTokenConfig = DEFAULT_CONFIG,
    ) {
        super({
            address,
            deployer,
            gasLimit: 300_000_000_000n,
            deploymentCalldata: buildDeploymentCalldata(config),
        });
    }

    public async buy(btcAmount: bigint, sender?: Address): Promise<{ tokensOut: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.buySelector);
        calldata.writeU256(btcAmount);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { tokensOut: reader.readU256(), response };
    }

    public async sell(tokenAmount: bigint, sender?: Address): Promise<{ btcOut: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.sellSelector);
        calldata.writeU256(tokenAmount);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { btcOut: reader.readU256(), response };
    }

    public async reserve(btcAmount: bigint, sender?: Address): Promise<{ expiryBlock: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.reserveSelector);
        calldata.writeU256(btcAmount);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { expiryBlock: reader.readU256(), response };
    }

    public async cancelReservation(sender?: Address): Promise<{ success: boolean; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.cancelReservationSelector);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { success: reader.readBoolean(), response };
    }

    public async claimPlatformFees(sender?: Address): Promise<{ amount: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.claimPlatformFeesSelector);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { amount: reader.readU256(), response };
    }

    public async claimCreatorFees(sender?: Address): Promise<{ amount: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.claimCreatorFeesSelector);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { amount: reader.readU256(), response };
    }

    public async claimMinterReward(sender?: Address): Promise<{ amount: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.claimMinterRewardSelector);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { amount: reader.readU256(), response };
    }

    public async getReserves(): Promise<{
        virtualBtc: bigint;
        virtualToken: bigint;
        realBtc: bigint;
        k: bigint;
    }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getReservesSelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return {
            virtualBtc: reader.readU256(),
            virtualToken: reader.readU256(),
            realBtc: reader.readU256(),
            k: reader.readU256(),
        };
    }

    public async getPrice(): Promise<bigint> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getPriceSelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readU256();
    }

    public async getConfig(): Promise<{
        creatorBps: bigint;
        buyTax: bigint;
        sellTax: bigint;
        destination: bigint;
        threshold: bigint;
    }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getConfigSelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return {
            creatorBps: reader.readU256(),
            buyTax: reader.readU256(),
            sellTax: reader.readU256(),
            destination: reader.readU256(),
            threshold: reader.readU256(),
        };
    }

    public async isGraduated(): Promise<boolean> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.isGraduatedSelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readBoolean();
    }

    public async getMinterInfo(addr: Address): Promise<{
        shares: bigint;
        buyBlock: bigint;
        eligible: boolean;
    }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getMinterInfoSelector);
        calldata.writeAddress(addr);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return {
            shares: reader.readU256(),
            buyBlock: reader.readU256(),
            eligible: reader.readBoolean(),
        };
    }

    public async getReservation(addr: Address): Promise<{ amount: bigint; expiryBlock: bigint }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getReservationSelector);
        calldata.writeAddress(addr);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return {
            amount: reader.readU256(),
            expiryBlock: reader.readU256(),
        };
    }

    public async balanceOf(addr: Address): Promise<bigint> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.balanceOfSelector);
        calldata.writeAddress(addr);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readU256();
    }

    public async totalSupply(): Promise<bigint> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.totalSupplySelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readU256();
    }

    protected handleError(error: Error): Error {
        return new Error(`(LaunchToken: ${this.address}) OP_NET: ${error.message}`);
    }

    protected defineRequiredBytecodes(): void {
        BytecodeManager.loadBytecode('../build/LaunchToken.wasm', this.address);
    }

    private getSelector(signature: string): number {
        return Number(`0x${this.abiCoder.encodeSelector(signature)}`);
    }

    private handleResponse(response: CallResponse): void {
        if (response.error) throw this.handleError(response.error);
        if (!response.response) throw new Error('No response to decode');
    }
}

import { Address, BinaryReader, BinaryWriter } from '@btc-vision/transaction';
import { BytecodeManager, CallResponse, ContractRuntime } from '@btc-vision/unit-test-framework';

export class OPumpFactoryRuntime extends ContractRuntime {
    private readonly registerTokenSelector = this.getSelector(
        'registerToken(string,string,uint256,uint256,uint256,uint256,uint256)',
    );
    private readonly getTokenCountSelector = this.getSelector('getTokenCount()');
    private readonly getTokenAtIndexSelector = this.getSelector('getTokenAtIndex(uint256)');
    private readonly getTokensByCreatorSelector = this.getSelector('getTokensByCreator(address)');
    private readonly getStatsSelector = this.getSelector('getStats()');

    public constructor(deployer: Address, address: Address) {
        super({
            address,
            deployer,
            gasLimit: 150_000_000_000n,
        });
    }

    public async registerToken(
        name: string,
        symbol: string,
        creatorAllocationBps: bigint,
        airdropBps: bigint,
        buyTaxBps: bigint,
        sellTaxBps: bigint,
        flywheelDestination: bigint,
        sender?: Address,
    ): Promise<{ tokenIndex: bigint; response: CallResponse }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.registerTokenSelector);
        calldata.writeStringWithLength(name);
        calldata.writeStringWithLength(symbol);
        calldata.writeU256(creatorAllocationBps);
        calldata.writeU256(airdropBps);
        calldata.writeU256(buyTaxBps);
        calldata.writeU256(sellTaxBps);
        calldata.writeU256(flywheelDestination);

        const response = await this.execute({
            calldata: calldata.getBuffer(),
            ...(sender ? { sender, txOrigin: sender } : {}),
        });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return { tokenIndex: reader.readU256(), response };
    }

    public async getTokenCount(): Promise<bigint> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getTokenCountSelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readU256();
    }

    public async getTokenAtIndex(index: bigint): Promise<bigint> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getTokenAtIndexSelector);
        calldata.writeU256(index);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readU256();
    }

    public async getTokensByCreator(creator: Address): Promise<bigint> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getTokensByCreatorSelector);
        calldata.writeAddress(creator);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        return new BinaryReader(response.response).readU256();
    }

    public async getStats(): Promise<{
        totalTokens: bigint;
        totalGraduated: bigint;
        totalVolume: bigint;
    }> {
        const calldata = new BinaryWriter();
        calldata.writeSelector(this.getStatsSelector);

        const response = await this.execute({ calldata: calldata.getBuffer() });
        this.handleResponse(response);

        const reader = new BinaryReader(response.response);
        return {
            totalTokens: reader.readU256(),
            totalGraduated: reader.readU256(),
            totalVolume: reader.readU256(),
        };
    }

    protected handleError(error: Error): Error {
        return new Error(`(OPumpFactory: ${this.address}) OP_NET: ${error.message}`);
    }

    protected defineRequiredBytecodes(): void {
        BytecodeManager.loadBytecode('../build/OPumpFactory.wasm', this.address);
    }

    private getSelector(signature: string): number {
        return Number(`0x${this.abiCoder.encodeSelector(signature)}`);
    }

    private handleResponse(response: CallResponse): void {
        if (response.error) throw this.handleError(response.error);
        if (!response.response) throw new Error('No response to decode');
    }
}

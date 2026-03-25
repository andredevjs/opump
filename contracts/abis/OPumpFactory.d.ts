import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type TokenRegisteredEvent = {
    readonly creator: Address;
    readonly tokenIndex: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the registerToken function call.
 */
export type RegisterToken = CallResult<
    {
        tokenIndex: bigint;
    },
    OPNetEvent<TokenRegisteredEvent>[]
>;

/**
 * @description Represents the result of the getTokenCount function call.
 */
export type GetTokenCount = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTokenAtIndex function call.
 */
export type GetTokenAtIndex = CallResult<
    {
        tokenCreator: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTokensByCreator function call.
 */
export type GetTokensByCreator = CallResult<
    {
        count: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getStats function call.
 */
export type GetStats = CallResult<
    {
        totalTokens: bigint;
        totalGraduated: bigint;
        totalVolume: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IOPumpFactory
// ------------------------------------------------------------------
export interface IOPumpFactory extends IOP_NETContract {
    registerToken(
        name: string,
        symbol: string,
        creatorAllocationBps: bigint,
        airdropBps: bigint,
        buyTaxBps: bigint,
        sellTaxBps: bigint,
        flywheelDestination: bigint,
    ): Promise<RegisterToken>;
    getTokenCount(): Promise<GetTokenCount>;
    getTokenAtIndex(index: bigint): Promise<GetTokenAtIndex>;
    getTokensByCreator(creator: Address): Promise<GetTokensByCreator>;
    getStats(): Promise<GetStats>;
}

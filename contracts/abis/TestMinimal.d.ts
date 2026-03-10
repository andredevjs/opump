import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the getTest function call.
 */
export type GetTest = CallResult<
    {
        result: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ITestMinimal
// ------------------------------------------------------------------
export interface ITestMinimal extends IOP_NETContract {
    getTest(): Promise<GetTest>;
}

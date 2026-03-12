import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------
export type BuyEvent = {
    readonly buyer: Address;
    readonly btcIn: bigint;
    readonly tokensOut: bigint;
    readonly newPrice: bigint;
};
export type SellEvent = {
    readonly seller: Address;
    readonly tokensIn: bigint;
    readonly btcOut: bigint;
    readonly newPrice: bigint;
};
export type ReservationEvent = {
    readonly user: Address;
    readonly amount: bigint;
    readonly expiryBlock: bigint;
};
export type FeeClaimedEvent = {
    readonly claimer: Address;
    readonly amount: bigint;
    readonly feeType: bigint;
};

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the buy function call.
 */
export type Buy = CallResult<
    {
        tokensOut: bigint;
    },
    OPNetEvent<BuyEvent>[]
>;

/**
 * @description Represents the result of the sell function call.
 */
export type Sell = CallResult<
    {
        btcOut: bigint;
    },
    OPNetEvent<SellEvent>[]
>;

/**
 * @description Represents the result of the reserve function call.
 */
export type Reserve = CallResult<
    {
        expiryBlock: bigint;
    },
    OPNetEvent<ReservationEvent>[]
>;

/**
 * @description Represents the result of the cancelReservation function call.
 */
export type CancelReservation = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the claimPlatformFees function call.
 */
export type ClaimPlatformFees = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<FeeClaimedEvent>[]
>;

/**
 * @description Represents the result of the claimCreatorFees function call.
 */
export type ClaimCreatorFees = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<FeeClaimedEvent>[]
>;

/**
 * @description Represents the result of the claimMinterReward function call.
 */
export type ClaimMinterReward = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<FeeClaimedEvent>[]
>;

/**
 * @description Represents the result of the getReserves function call.
 */
export type GetReserves = CallResult<
    {
        virtualBtc: bigint;
        virtualToken: bigint;
        realBtc: bigint;
        k: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPrice function call.
 */
export type GetPrice = CallResult<
    {
        priceSatsPerToken: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getConfig function call.
 */
export type GetConfig = CallResult<
    {
        creatorBps: bigint;
        buyTax: bigint;
        sellTax: bigint;
        destination: bigint;
        threshold: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the isGraduated function call.
 */
export type IsGraduated = CallResult<
    {
        isGraduated: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getMinterInfo function call.
 */
export type GetMinterInfo = CallResult<
    {
        shares: bigint;
        buyBlock: bigint;
        eligible: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getReservation function call.
 */
export type GetReservation = CallResult<
    {
        amount: bigint;
        expiryBlock: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ILaunchToken
// ------------------------------------------------------------------
export interface ILaunchToken extends IOP_NETContract {
    buy(btcAmount: bigint): Promise<Buy>;
    sell(tokenAmount: bigint): Promise<Sell>;
    reserve(btcAmount: bigint): Promise<Reserve>;
    cancelReservation(): Promise<CancelReservation>;
    claimPlatformFees(): Promise<ClaimPlatformFees>;
    claimCreatorFees(): Promise<ClaimCreatorFees>;
    claimMinterReward(): Promise<ClaimMinterReward>;
    getReserves(): Promise<GetReserves>;
    getPrice(): Promise<GetPrice>;
    getConfig(): Promise<GetConfig>;
    isGraduated(): Promise<IsGraduated>;
    getMinterInfo(addr: Address): Promise<GetMinterInfo>;
    getReservation(addr: Address): Promise<GetReservation>;
}

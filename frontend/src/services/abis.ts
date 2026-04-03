/**
 * ABI definitions and TypeScript interfaces for OPump contracts.
 *
 * ABIs are composed from generated contract artifacts in contracts/abis/.
 * LaunchToken = OP20 base methods + LaunchToken-specific methods/events.
 */

import {
  type BitcoinInterfaceAbi,
  type CallResult,
  type OPNetEvent,
  type IOP20Contract,
  type BaseContractProperties,
} from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { LaunchTokenAbi } from '@contracts/abis/LaunchToken.abi';
import { OP20Abi } from '@contracts/abis/OP20.abi';
import { OPumpFactoryAbi } from '@contracts/abis/OPumpFactory.abi';

// ============ LaunchToken ABI ============
// Compose OP20 base (balanceOf, transfer, etc.) + LaunchToken methods/events
export const LAUNCH_TOKEN_ABI = [...OP20Abi, ...LaunchTokenAbi] as BitcoinInterfaceAbi;

// ============ LaunchToken Result Types ============

type BuyEvent = {
  readonly buyer: Address;
  readonly btcIn: bigint;
  readonly tokensOut: bigint;
  readonly newPrice: bigint;
};

type SellEvent = {
  readonly seller: Address;
  readonly tokensIn: bigint;
  readonly btcOut: bigint;
  readonly newPrice: bigint;
};

type FeeClaimedEventData = {
  readonly claimer: Address;
  readonly amount: bigint;
  readonly feeType: bigint;
};

type MigrationEventData = {
  readonly recipient: Address;
  readonly tokenAmount: bigint;
  readonly btcReserve: bigint;
};

export type BuyResult = CallResult<{ tokensOut: bigint }, [OPNetEvent<BuyEvent>]>;
export type SellResult = CallResult<{ btcOut: bigint }, [OPNetEvent<SellEvent>]>;
export type ClaimResult = CallResult<{ amount: bigint }, [OPNetEvent<FeeClaimedEventData>]>;
export type ReserveResult = CallResult<{ expiryBlock: bigint }, []>;
export type CancelReservationResult = CallResult<{ success: boolean }, []>;
export type GetReservesResult = CallResult<{ currentSupplyOnCurve: bigint; realBtc: bigint; aScaled: bigint; bScaled: bigint }, []>;
export type GetPriceResult = CallResult<{ priceSatsPerToken: bigint }, []>;
export type GetConfigResult = CallResult<{ creatorBps: bigint; airdropBps: bigint; buyTax: bigint; sellTax: bigint; destination: bigint; threshold: bigint }, []>;
export type IsGraduatedResult = CallResult<{ isGraduated: boolean }, []>;
export type IsMigratedResult = CallResult<{ isMigrated: boolean }, []>;
export type MigrateResult = CallResult<{ tokenAmount: bigint }, [OPNetEvent<MigrationEventData>]>;
export type GetFeePoolsResult = CallResult<{ platformFees: bigint; creatorFees: bigint }, []>;
export type GetReservationResult = CallResult<{ amount: bigint; expiryBlock: bigint }, []>;

// ============ LaunchToken Interface ============

export interface ILaunchTokenContract extends IOP20Contract {
  // Write
  buy(btcAmount: bigint): Promise<BuyResult>;
  sell(tokenAmount: bigint): Promise<SellResult>;
  reserve(btcAmount: bigint): Promise<ReserveResult>;
  cancelReservation(): Promise<CancelReservationResult>;
  claimCreatorFees(): Promise<ClaimResult>;
  claimPlatformFees(): Promise<ClaimResult>;
  migrate(recipient: Address): Promise<MigrateResult>;
  // Read
  getReserves(): Promise<GetReservesResult>;
  getPrice(): Promise<GetPriceResult>;
  getConfig(): Promise<GetConfigResult>;
  getFeePools(): Promise<GetFeePoolsResult>;
  isGraduated(): Promise<IsGraduatedResult>;
  isMigrated(): Promise<IsMigratedResult>;
  getReservation(addr: Address): Promise<GetReservationResult>;
}

// ============ Factory ABI ============
export const OPUMP_FACTORY_ABI = [...OPumpFactoryAbi] as BitcoinInterfaceAbi;

// ============ Factory Result Types ============

export type RegisterTokenResult = CallResult<{ tokenIndex: bigint }, []>;
export type GetTokenCountResult = CallResult<{ count: bigint }, []>;
export type GetStatsResult = CallResult<{ totalTokens: bigint; totalGraduated: bigint; totalVolume: bigint }, []>;

// ============ Factory Interface ============

export interface IOPumpFactoryContract extends BaseContractProperties {
  registerToken(
    name: string,
    symbol: string,
    creatorAllocationBps: bigint,
    airdropBps: bigint,
    buyTaxBps: bigint,
    sellTaxBps: bigint,
    flywheelDestination: bigint,
  ): Promise<RegisterTokenResult>;
  getTokenCount(): Promise<GetTokenCountResult>;
  getTokenAtIndex(index: bigint): Promise<CallResult<{ tokenCreator: bigint }, []>>;
  getTokensByCreator(creator: Address): Promise<CallResult<{ count: bigint }, []>>;
  getStats(): Promise<GetStatsResult>;
}

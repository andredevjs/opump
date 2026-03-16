/**
 * ABI definitions and TypeScript interfaces for OPump contracts.
 * LaunchToken extends OP20 with bonding curve buy/sell + fee claims.
 * OPumpFactory handles token registration.
 */

import {
  ABIDataTypes,
  BitcoinAbiTypes,
  type BitcoinInterfaceAbi,
  type CallResult,
  type OPNetEvent,
  type IOP20Contract,
  OP_20_ABI,
  type BaseContractProperties,
} from 'opnet';
import type { Address } from '@btc-vision/transaction';

// ============ LaunchToken ABI ============

export const LAUNCH_TOKEN_ABI: BitcoinInterfaceAbi = [
  ...OP_20_ABI,

  // --- Write methods ---
  {
    name: 'buy',
    type: BitcoinAbiTypes.Function,
    payable: true,
    inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'tokensOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'sell',
    type: BitcoinAbiTypes.Function,
    inputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'btcOut', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'reserve',
    type: BitcoinAbiTypes.Function,
    payable: true,
    inputs: [{ name: 'btcAmount', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'expiryBlock', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'cancelReservation',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'penalty', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'claimCreatorFees',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'claimMinterReward',
    type: BitcoinAbiTypes.Function,
    inputs: [],
    outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
  },

  // --- Read methods ---
  {
    name: 'getReserves',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'virtualBtc', type: ABIDataTypes.UINT256 },
      { name: 'virtualToken', type: ABIDataTypes.UINT256 },
      { name: 'realBtc', type: ABIDataTypes.UINT256 },
      { name: 'k', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'getPrice',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [{ name: 'priceSatsPerToken', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getConfig',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'creatorBps', type: ABIDataTypes.UINT256 },
      { name: 'buyTax', type: ABIDataTypes.UINT256 },
      { name: 'sellTax', type: ABIDataTypes.UINT256 },
      { name: 'destination', type: ABIDataTypes.UINT256 },
      { name: 'threshold', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'isGraduated',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [{ name: 'isGraduated', type: ABIDataTypes.BOOL }],
  },
  {
    name: 'getMinterInfo',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
    outputs: [
      { name: 'shares', type: ABIDataTypes.UINT256 },
      { name: 'buyBlock', type: ABIDataTypes.UINT256 },
      { name: 'eligible', type: ABIDataTypes.BOOL },
    ],
  },
  {
    name: 'getFeePools',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'platformFees', type: ABIDataTypes.UINT256 },
      { name: 'creatorFees', type: ABIDataTypes.UINT256 },
      { name: 'minterFees', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'getReservation',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
    outputs: [
      { name: 'amount', type: ABIDataTypes.UINT256 },
      { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
    ],
  },

  // --- Events ---
  {
    name: 'Buy',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'buyer', type: ABIDataTypes.ADDRESS },
      { name: 'btcAmount', type: ABIDataTypes.UINT256 },
      { name: 'tokensOut', type: ABIDataTypes.UINT256 },
      { name: 'newPrice', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'Sell',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'seller', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAmount', type: ABIDataTypes.UINT256 },
      { name: 'btcOut', type: ABIDataTypes.UINT256 },
      { name: 'newPrice', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'Graduation',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'triggeredBy', type: ABIDataTypes.ADDRESS },
      { name: 'realBtcReserve', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'Reservation',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'user', type: ABIDataTypes.ADDRESS },
      { name: 'btcAmount', type: ABIDataTypes.UINT256 },
      { name: 'expiryBlock', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'FeeClaimed',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'claimer', type: ABIDataTypes.ADDRESS },
      { name: 'amount', type: ABIDataTypes.UINT256 },
      { name: 'feeType', type: ABIDataTypes.UINT256 },
    ],
  },
];

// ============ LaunchToken Result Types ============

type BuyEvent = {
  readonly buyer: Address;
  readonly btcAmount: bigint;
  readonly tokensOut: bigint;
  readonly newPrice: bigint;
};

type SellEvent = {
  readonly seller: Address;
  readonly tokenAmount: bigint;
  readonly btcOut: bigint;
  readonly newPrice: bigint;
};

type FeeClaimedEventData = {
  readonly claimer: Address;
  readonly amount: bigint;
  readonly feeType: bigint;
};

export type BuyResult = CallResult<{ tokensOut: bigint }, [OPNetEvent<BuyEvent>]>;
export type SellResult = CallResult<{ btcOut: bigint }, [OPNetEvent<SellEvent>]>;
export type ClaimResult = CallResult<{ amount: bigint }, [OPNetEvent<FeeClaimedEventData>]>;
export type ReserveResult = CallResult<{ expiryBlock: bigint }, []>;
export type CancelReservationResult = CallResult<{ penalty: bigint }, []>;
export type GetReservesResult = CallResult<{ virtualBtc: bigint; virtualToken: bigint; realBtc: bigint; k: bigint }, []>;
export type GetPriceResult = CallResult<{ priceSatsPerToken: bigint }, []>;
export type GetConfigResult = CallResult<{ creatorBps: bigint; buyTax: bigint; sellTax: bigint; destination: bigint; threshold: bigint }, []>;
export type IsGraduatedResult = CallResult<{ isGraduated: boolean }, []>;
export type GetMinterInfoResult = CallResult<{ shares: bigint; buyBlock: bigint; eligible: boolean }, []>;
export type GetFeePoolsResult = CallResult<{ platformFees: bigint; creatorFees: bigint; minterFees: bigint }, []>;
export type GetReservationResult = CallResult<{ amount: bigint; expiryBlock: bigint }, []>;

// ============ LaunchToken Interface ============

export interface ILaunchTokenContract extends IOP20Contract {
  // Write
  buy(btcAmount: bigint): Promise<BuyResult>;
  sell(tokenAmount: bigint): Promise<SellResult>;
  reserve(btcAmount: bigint): Promise<ReserveResult>;
  cancelReservation(): Promise<CancelReservationResult>;
  claimCreatorFees(): Promise<ClaimResult>;
  claimMinterReward(): Promise<ClaimResult>;
  // Read
  getReserves(): Promise<GetReservesResult>;
  getPrice(): Promise<GetPriceResult>;
  getConfig(): Promise<GetConfigResult>;
  getFeePools(): Promise<GetFeePoolsResult>;
  isGraduated(): Promise<IsGraduatedResult>;
  getMinterInfo(addr: Address): Promise<GetMinterInfoResult>;
  getReservation(addr: Address): Promise<GetReservationResult>;
}

// ============ Factory ABI ============

export const OPUMP_FACTORY_ABI: BitcoinInterfaceAbi = [
  {
    name: 'registerToken',
    type: BitcoinAbiTypes.Function,
    inputs: [
      { name: 'name', type: ABIDataTypes.STRING },
      { name: 'symbol', type: ABIDataTypes.STRING },
      { name: 'creatorAllocationBps', type: ABIDataTypes.UINT256 },
      { name: 'buyTaxBps', type: ABIDataTypes.UINT256 },
      { name: 'sellTaxBps', type: ABIDataTypes.UINT256 },
      { name: 'flywheelDestination', type: ABIDataTypes.UINT256 },
    ],
    outputs: [{ name: 'tokenIndex', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getTokenCount',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getTokenAtIndex',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [{ name: 'index', type: ABIDataTypes.UINT256 }],
    outputs: [{ name: 'tokenCreator', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getTokensByCreator',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [{ name: 'creator', type: ABIDataTypes.ADDRESS }],
    outputs: [{ name: 'count', type: ABIDataTypes.UINT256 }],
  },
  {
    name: 'getStats',
    type: BitcoinAbiTypes.Function,
    constant: true,
    inputs: [],
    outputs: [
      { name: 'totalTokens', type: ABIDataTypes.UINT256 },
      { name: 'totalGraduated', type: ABIDataTypes.UINT256 },
      { name: 'totalVolume', type: ABIDataTypes.UINT256 },
    ],
  },
  {
    name: 'TokenDeployed',
    type: BitcoinAbiTypes.Event,
    values: [
      { name: 'creator', type: ABIDataTypes.ADDRESS },
      { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
    ],
  },
];

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
    buyTaxBps: bigint,
    sellTaxBps: bigint,
    flywheelDestination: bigint,
  ): Promise<RegisterTokenResult>;
  getTokenCount(): Promise<GetTokenCountResult>;
  getTokenAtIndex(index: bigint): Promise<CallResult<{ tokenCreator: bigint }, []>>;
  getTokensByCreator(creator: Address): Promise<CallResult<{ count: bigint }, []>>;
  getStats(): Promise<GetStatsResult>;
}

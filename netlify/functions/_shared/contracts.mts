/**
 * Type definitions for OPNet contract RPC call responses.
 * Used instead of `as unknown as { ... }` casts when calling contract methods.
 */

/** Generic OPNet event as returned by the RPC provider */
export interface OPNetEvent {
  type?: string;
  data?: Uint8Array | string;
  [key: string]: unknown;
}

/** Deployment transaction shape from OPNet RPC */
export interface DeploymentTx {
  from?: { p2tr: (n: unknown) => string; toHex: () => string } | string;
  deployerAddress?: { p2tr: (n: unknown) => string; toHex: () => string } | string;
  contractAddress?: string;
  blockNumber?: string | bigint;
}

/**
 * LaunchToken ABI is constructed at runtime in on-chain-verify.mts and indexer-core.mts
 * using dynamically imported ABIDataTypes and BitcoinAbiTypes from "opnet".
 * Methods: getReserves (outputs: virtualBtc, virtualToken, realBtc, k)
 *          getConfig   (outputs: creatorBps, buyTax, sellTax, destination, threshold)
 */

export interface LaunchTokenReservesResponse {
  properties: {
    virtualBtc: bigint;
    virtualToken: bigint;
    realBtc: bigint;
    k: bigint;
  };
}

export interface LaunchTokenConfigResponse {
  properties: {
    creatorBps: bigint;
    buyTax: bigint;
    sellTax: bigint;
    destination: bigint;
    threshold: bigint;
  };
}

export interface LaunchTokenContract {
  getReserves(): Promise<LaunchTokenReservesResponse>;
  getConfig(): Promise<LaunchTokenConfigResponse>;
}

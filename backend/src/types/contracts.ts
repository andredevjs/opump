/**
 * Type definitions for OPNet contract RPC call responses.
 * Used instead of `as unknown as { ... }` casts when calling contract methods.
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

/** W7: Type for deployment transaction from OPNet RPC */
export interface DeploymentTransaction {
  from?: { p2tr: (n: unknown) => string; toHex: () => string } | string;
  deployerAddress?: { p2tr: (n: unknown) => string; toHex: () => string } | string;
  contractAddress?: string;
  blockNumber?: string | bigint;
}

/** W9: Type for pending transactions from the mempool RPC */
export interface PendingTransaction {
  hash: string;
  OPNetType?: string;
  contractAddress?: string;
  events?: unknown[];
  [key: string]: unknown;
}

/** W10: Type for interaction transactions in a confirmed block */
export interface InteractionTransaction {
  hash: string;
  OPNetType?: string;
  contractAddress?: string;
  events?: Record<string, unknown[]>;
  [key: string]: unknown;
}

/** S2: Type for OPNet events from contract execution */
export interface OPNetEvent {
  type?: string;
  data?: Uint8Array | string;
  properties?: Record<string, unknown>;
}

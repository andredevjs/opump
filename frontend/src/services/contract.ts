/**
 * OPNet contract interaction service.
 * Provides cached contract instances and a type-safe sendContractCall helper.
 *
 * FRONTEND RULES:
 * - signer: null, mldsaSigner: null (OPWallet handles signing)
 * - Always simulate before sending
 * - Cache contract instances per address
 * - Clear cache on network switch
 */

import { getContract, JSONRpcProvider, TransactionOutputFlags, type CallResult } from 'opnet';
import { networks, type Network } from '@btc-vision/bitcoin';
import type { InteractionTransactionReceipt, TransactionParameters } from 'opnet';
import {
  LAUNCH_TOKEN_ABI,
  OPUMP_FACTORY_ABI,
  type ILaunchTokenContract,
  type IOPumpFactoryContract,
} from './abis';

if (!import.meta.env.VITE_OPNET_RPC_URL && import.meta.env.PROD) {
  throw new Error('VITE_OPNET_RPC_URL is required in production');
}
const RPC_URL = import.meta.env.VITE_OPNET_RPC_URL || 'https://testnet.opnet.org';

function getNetwork(): Network {
  const net = import.meta.env.VITE_OPNET_NETWORK || 'testnet';
  switch (net) {
    case 'mainnet': return networks.bitcoin;
    case 'regtest': return networks.regtest;
    default: return networks.opnetTestnet;
  }
}

// Singleton provider
let _provider: JSONRpcProvider | null = null;
function getProvider(): JSONRpcProvider {
  if (!_provider) {
    _provider = new JSONRpcProvider({ url: RPC_URL, network: getNetwork() });
  }
  return _provider;
}

// Contract instance caches
const launchTokenCache = new Map<string, ReturnType<typeof getContract<ILaunchTokenContract>>>();
const factoryCache = new Map<string, ReturnType<typeof getContract<IOPumpFactoryContract>>>();

/**
 * Clear all cached contract instances and provider.
 * Call on network switch.
 */
export function clearContractCache(): void {
  launchTokenCache.clear();
  factoryCache.clear();
  _provider = null;
}

/**
 * Get a LaunchToken contract instance (cached).
 * Uses LAUNCH_TOKEN_ABI which extends OP20 with buy/sell/claim methods.
 */
export function getLaunchTokenContract(address: string) {
  const cached = launchTokenCache.get(address);
  if (cached) return cached;

  const provider = getProvider();
  const network = getNetwork();
  const contract = getContract<ILaunchTokenContract>(address, LAUNCH_TOKEN_ABI, provider, network);
  launchTokenCache.set(address, contract);
  return contract;
}

/**
 * Get the OPumpFactory contract instance (cached).
 * Uses OPUMP_FACTORY_ABI for typed deployToken/getStats calls.
 */
export function getFactoryContract(address: string) {
  const cached = factoryCache.get(address);
  if (cached) return cached;

  const provider = getProvider();
  const network = getNetwork();
  const contract = getContract<IOPumpFactoryContract>(address, OPUMP_FACTORY_ABI, provider, network);
  factoryCache.set(address, contract);
  return contract;
}

export interface TransactionReceipt {
  txHash: string;
  status: string;
}

export interface ExtraOutput {
  address: string;
  value: number;
}

export interface SendOptions {
  refundTo: string;
  maximumAllowedSatToSpend?: bigint;
  feeRate?: number;
  extraOutputs?: ExtraOutput[];
}

/**
 * Send a contract call that has already been simulated.
 * Accepts the CallResult from a typed contract method invocation.
 *
 * Usage:
 *   const contract = getLaunchTokenContract(address);
 *   const sim = await contract.sell(tokenAmount);
 *   const receipt = await sendContractCall(sim, { refundTo });
 */
export async function sendContractCall(
  sim: CallResult,
  options: SendOptions,
): Promise<TransactionReceipt> {
  if (sim.revert) {
    throw new Error(`Contract reverted: ${sim.revert}`);
  }

  const network = getNetwork();

  const txParams = {
    signer: null as null,
    mldsaSigner: null as null,
    refundTo: options.refundTo,
    maximumAllowedSatToSpend: options.maximumAllowedSatToSpend ?? 50000n,
    feeRate: options.feeRate ?? 10,
    network,
    ...(options.extraOutputs?.length ? { extraOutputs: options.extraOutputs } : {}),
  };

  const receipt: InteractionTransactionReceipt = await sim.sendTransaction(
    txParams as TransactionParameters,
  );

  return {
    txHash: receipt.transactionId ?? '',
    status: 'sent',
  };
}

/**
 * Query the on-chain balance of a token for a given wallet.
 * Returns the raw token units as a string (to avoid BigInt serialization issues).
 */
export async function fetchBalanceOf(
  tokenAddress: string,
  hashedMLDSAKey: string,
  tweakedPubKey: string,
): Promise<string> {
  const { Address } = await import('@btc-vision/transaction');
  const ownerAddress = Address.fromString(hashedMLDSAKey, tweakedPubKey);
  const contract = getLaunchTokenContract(tokenAddress);
  const result = await contract.balanceOf(ownerAddress);
  if (result.revert) throw new Error(`balanceOf reverted: ${result.revert}`);
  return result.properties.balance.toString();
}

/**
 * Poll the RPC provider until a transaction receipt is found, indicating on-chain confirmation.
 * Rejects after `timeoutMs` if no receipt appears.
 */
export async function waitForConfirmation(
  txHash: string,
  pollIntervalMs = 5000,
  timeoutMs = 120_000,
): Promise<void> {
  const provider = getProvider();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return;
    } catch {
      // RPC error — keep polling
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  throw new Error(`Transaction ${txHash.slice(0, 12)}... not confirmed after ${timeoutMs / 1000}s`);
}

/**
 * Set up transaction details for a @payable contract call.
 * Must be called BEFORE simulate so the contract sees the BTC output.
 * The `setTransactionDetails` state clears after each simulate call.
 *
 * @param contract  - The contract instance from getContract()
 * @param to        - Recipient address (usually the contract address)
 * @param valueSats - BTC amount in satoshis (bigint)
 */
export function setupPayableCall(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contract: { setTransactionDetails: (details: any) => void },
  to: string,
  valueSats: bigint,
): void {
  contract.setTransactionDetails({
    inputs: [],
    outputs: [
      {
        to,
        value: valueSats,
        index: 1, // index 0 is RESERVED for internal use
        flags: TransactionOutputFlags.hasTo,
      },
    ],
  });
}

// Re-export for convenience
export type { ILaunchTokenContract, IOPumpFactoryContract } from './abis';

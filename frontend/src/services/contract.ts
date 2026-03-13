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
import { networks, Transaction as BitcoinTransaction, type Network } from '@btc-vision/bitcoin';
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
 * Uses OPUMP_FACTORY_ABI for typed registerToken/getStats calls.
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
  timeoutMs = 300_000,
): Promise<void> {
  const provider = getProvider();
  const start = Date.now();

  // Wait before the first poll — the node needs time to index the broadcast tx
  await new Promise((r) => setTimeout(r, pollIntervalMs));

  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return;
    } catch {
      // RPC may return "transaction not found" until it's mined — keep polling
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

// ============ Contract Deployment ============

export interface DeployResult {
  contractAddress: string;
  revealTxHash: string;
}

/**
 * Build constructor calldata for a LaunchToken deployment.
 * Must match LaunchToken.onDeployment() parameter order.
 */
export async function buildLaunchTokenCalldata(opts: {
  name: string;
  symbol: string;
  maxSupply?: bigint;
  creatorAllocationBps: bigint;
  buyTaxBps: bigint;
  sellTaxBps: bigint;
  flywheelDestination: bigint;
  graduationThreshold?: bigint;
  vaultAddress: string;
}): Promise<Uint8Array> {
  const { BinaryWriter } = await import('@btc-vision/transaction');
  const writer = new BinaryWriter();
  writer.writeStringWithLength(opts.name);
  writer.writeStringWithLength(opts.symbol);
  writer.writeU256(opts.maxSupply ?? 0n); // 0 = use contract default
  writer.writeU256(opts.creatorAllocationBps);
  writer.writeU256(opts.buyTaxBps);
  writer.writeU256(opts.sellTaxBps);
  writer.writeU256(opts.flywheelDestination);
  writer.writeU256(opts.graduationThreshold ?? 0n); // 0 = use contract default
  writer.writeStringWithLength(opts.vaultAddress);
  return writer.getBuffer();
}

/**
 * Deploy a LaunchToken contract via OPWallet's web3.deployContract() API.
 * Fetches the pre-compiled WASM from the given URL, signs via OPWallet,
 * and broadcasts the funding + reveal transactions.
 */
export async function deployLaunchToken(
  bytecodeUrl: string,
  calldata: Uint8Array,
  walletAddress: string,
): Promise<DeployResult> {
  // Access OPWallet's web3 provider via window.opnet
  const opwallet = (window as unknown as { opnet?: { web3?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deployContract: (params: any) => Promise<{ contractAddress: string; transaction: [string, string] }>;
  } } }).opnet;

  if (!opwallet?.web3?.deployContract) {
    throw new Error('OPWallet not found or does not support contract deployment. Make sure OPWallet extension is installed.');
  }

  // Fetch pre-compiled WASM bytecode
  const response = await fetch(bytecodeUrl);
  if (!response.ok) throw new Error('Failed to fetch contract bytecode');
  const bytecode = new Uint8Array(await response.arrayBuffer());

  // Get UTXOs for funding
  const provider = getProvider();
  const utxos = await provider.utxoManager.getUTXOs({ address: walletAddress });
  if (utxos.length === 0) {
    throw new Error('No UTXOs available for deployment. Fund your wallet first.');
  }

  // OPWallet signs the deployment but does NOT broadcast — we must do it ourselves
  const result = await opwallet.web3.deployContract({
    bytecode,
    calldata,
    from: walletAddress,
    utxos,
    feeRate: 10,
    priorityFee: 0n,
    gasSatFee: 10_000n,
  });

  // Broadcast funding tx, then reveal tx
  const fundingBroadcast = await provider.sendRawTransaction(result.transaction[0], false);
  if (!fundingBroadcast.success) {
    throw new Error(`Funding tx broadcast failed: ${fundingBroadcast.error ?? 'unknown error'}`);
  }

  const revealBroadcast = await provider.sendRawTransaction(result.transaction[1], false);
  if (!revealBroadcast.success) {
    throw new Error(`Reveal tx broadcast failed: ${revealBroadcast.error ?? 'unknown error'}`);
  }

  // Use txid from broadcast result, fall back to computing from raw tx
  const revealTxId = revealBroadcast.result
    ?? BitcoinTransaction.fromHex(result.transaction[1]).getId();

  return {
    contractAddress: result.contractAddress,
    revealTxHash: revealTxId,
  };
}

// Re-export for convenience
export type { ILaunchTokenContract, IOPumpFactoryContract } from './abis';

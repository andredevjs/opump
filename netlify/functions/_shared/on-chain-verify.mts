/**
 * On-chain token verification — extracted from backend/src/routes/tokens.ts.
 * Verifies deployment tx, deployer address, contract type, and config.
 */

import type { LaunchTokenContract, DeploymentTx } from "./contracts.mts";

export interface OnChainVerificationResult {
  valid: boolean;
  error?: string;
  deployBlock?: number;
}

export async function verifyTokenOnChain(
  contractAddress: string,
  creatorAddress: string,
  deployTxHash: string,
  clientConfig: { creatorAllocationBps: number; airdropBps: number; buyTaxBps: number; sellTaxBps: number },
): Promise<OnChainVerificationResult> {
  const opnetRpcUrl = process.env.OPNET_RPC_URL || "https://testnet.opnet.org";
  const networkName = process.env.NETWORK || "testnet";

  const { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } = await import("opnet");
  const { networks } = await import("@btc-vision/bitcoin");
  const network = networkName === "mainnet" ? networks.bitcoin : networks.opnetTestnet;
  const provider = new JSONRpcProvider({ url: opnetRpcUrl, network });

  // 1. Verify deployment tx exists
  const tx = await provider.getTransaction(deployTxHash);
  if (!tx) {
    return { valid: false, error: "Deployment transaction not found on-chain. Wait for confirmation." };
  }

  // 2. Verify deployer matches creator
  const deploymentTx = tx as unknown as DeploymentTx;

  try {
    const rawDeployer = deploymentTx.deployerAddress ?? deploymentTx.from;
    if (rawDeployer) {
      let deployerAddress: string;
      if (typeof rawDeployer === "string") {
        deployerAddress = rawDeployer;
      } else if (typeof rawDeployer === "object" && "p2tr" in rawDeployer && typeof rawDeployer.p2tr === "function") {
        deployerAddress = rawDeployer.p2tr(network);
      } else {
        console.error("[Verify] Unexpected deployer address type:", typeof rawDeployer);
        return { valid: false, error: "Unable to extract deployer address from deployment transaction." };
      }

      if (deployerAddress !== creatorAddress) {
        return {
          valid: false,
          error: `Creator address mismatch: deployer is ${deployerAddress}, but ${creatorAddress} was submitted`,
        };
      }
    } else {
      return { valid: false, error: "Cannot verify deployer: deployment transaction has no deployer or from field." };
    }
  } catch (err) {
    console.warn("[Verify] Deployer verification failed:", err instanceof Error ? err.message : err);
    return { valid: false, error: "Failed to verify deployer address on-chain." };
  }

  // 3. Verify contract is a LaunchToken
  const launchTokenAbi: import("opnet").BitcoinInterfaceAbi = [
    {
      name: "getReserves",
      type: BitcoinAbiTypes.Function,
      constant: true,
      inputs: [],
      outputs: [
        { name: "currentSupplyOnCurve", type: ABIDataTypes.UINT256 },
        { name: "realBtc", type: ABIDataTypes.UINT256 },
        { name: "aScaled", type: ABIDataTypes.UINT256 },
        { name: "bScaled", type: ABIDataTypes.UINT256 },
      ],
    },
    {
      name: "getConfig",
      type: BitcoinAbiTypes.Function,
      constant: true,
      inputs: [],
      outputs: [
        { name: "creatorBps", type: ABIDataTypes.UINT256 },
        { name: "airdropBps", type: ABIDataTypes.UINT256 },
        { name: "buyTax", type: ABIDataTypes.UINT256 },
        { name: "sellTax", type: ABIDataTypes.UINT256 },
        { name: "destination", type: ABIDataTypes.UINT256 },
        { name: "threshold", type: ABIDataTypes.UINT256 },
      ],
    },
  ];

  let contract: ReturnType<typeof getContract>;
  try {
    contract = getContract(contractAddress, launchTokenAbi, provider, network);
  } catch {
    return { valid: false, error: "Failed to connect to contract. Invalid contract address." };
  }

  // 3a. Call getReserves
  try {
    const reserves = await (contract as unknown as LaunchTokenContract).getReserves();

    if (!reserves?.properties) {
      return { valid: false, error: "Contract is not a valid LaunchToken (getReserves returned no data)." };
    }
  } catch {
    return { valid: false, error: "Contract is not a valid LaunchToken (getReserves call failed)." };
  }

  // 3b. Call getConfig and verify parameters match
  try {
    const onChainConfig = await (contract as unknown as LaunchTokenContract).getConfig();

    if (!onChainConfig?.properties) {
      return { valid: false, error: "Failed to read contract config on-chain." };
    }

    const { creatorBps, airdropBps, buyTax, sellTax } = onChainConfig.properties;

    if (Number(creatorBps) !== clientConfig.creatorAllocationBps) {
      return {
        valid: false,
        error: `Creator allocation mismatch: on-chain=${creatorBps}, submitted=${clientConfig.creatorAllocationBps}`,
      };
    }
    if (Number(airdropBps) !== clientConfig.airdropBps) {
      return {
        valid: false,
        error: `Airdrop mismatch: on-chain=${airdropBps}, submitted=${clientConfig.airdropBps}`,
      };
    }
    if (Number(buyTax) !== clientConfig.buyTaxBps) {
      return {
        valid: false,
        error: `Buy tax mismatch: on-chain=${buyTax}, submitted=${clientConfig.buyTaxBps}`,
      };
    }
    if (Number(sellTax) !== clientConfig.sellTaxBps) {
      return {
        valid: false,
        error: `Sell tax mismatch: on-chain=${sellTax}, submitted=${clientConfig.sellTaxBps}`,
      };
    }
  } catch {
    return { valid: false, error: "Failed to verify contract config on-chain." };
  }

  // Extract deploy block
  let deployBlock = 0;
  if (deploymentTx.blockNumber) {
    deployBlock = typeof deploymentTx.blockNumber === "bigint"
      ? Number(deploymentTx.blockNumber)
      : parseInt(String(deploymentTx.blockNumber), 10) || 0;
  }

  return { valid: true, deployBlock };
}

import { config } from '../config/env.js';
import { getTokensCollection } from '../db/models/Token.js';
import type { WebSocketService } from './WebSocketService.js';

type MigrationStep = 'pending' | 'tokens_minted' | 'pool_created' | 'liquidity_listed' | 'complete';

const MAX_RETRIES = 5;
const BASE_RETRY_MS = 5_000;
const MAX_SATS_PER_TX = 100_000n;

interface MigrationJob {
  tokenAddress: string;
  retries: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface WalletAndProvider {
  wallet: { keypair: unknown; mldsaKeypair: unknown; address: unknown; addresses: string[]; publicKey: Uint8Array };
  provider: import('opnet').JSONRpcProvider;
  network: import('@btc-vision/bitcoin').Network;
}

export class MigrationService {
  private activeJobs = new Map<string, MigrationJob>();
  private cachedWalletAndProvider: WalletAndProvider | null = null;

  constructor(private wsService: WebSocketService) {}

  /**
   * Resume any in-progress migrations from DB on startup.
   */
  async resume(): Promise<void> {
    if (!config.migrationWalletMnemonic) {
      console.log('[Migration] No MIGRATION_WALLET_MNEMONIC set — migration disabled');
      return;
    }

    const tokens = getTokensCollection();
    const migrating = await tokens.find({ status: 'migrating' }).toArray();

    for (const token of migrating) {
      console.log(`[Migration] Resuming migration for ${token._id} (step: ${token.migrationStatus ?? 'pending'})`);
      this.runMigration(token._id).catch((err) => {
        console.error(`[Migration] Resume failed for ${token._id}:`, err instanceof Error ? err.message : err);
      });
    }
  }

  /**
   * Start migration for a newly graduated token.
   */
  async startMigration(tokenAddress: string): Promise<void> {
    if (!config.migrationWalletMnemonic) {
      console.log(`[Migration] Skipping migration for ${tokenAddress} — no wallet configured`);
      return;
    }

    if (this.activeJobs.has(tokenAddress)) {
      console.log(`[Migration] Migration already active for ${tokenAddress}`);
      return;
    }

    const tokens = getTokensCollection();
    await tokens.updateOne(
      { _id: tokenAddress },
      {
        $set: {
          status: 'migrating',
          migrationStatus: 'pending' as MigrationStep,
          updatedAt: new Date(),
        },
      },
    );

    this.wsService.broadcast(`token:price:${tokenAddress}`, 'token_migrating', {
      tokenAddress,
    });
    this.wsService.broadcast('platform', 'token_migrating', { tokenAddress });

    console.log(`[Migration] Starting migration for ${tokenAddress}`);
    await this.runMigration(tokenAddress);
  }

  /**
   * Stop all active migration timers (for graceful shutdown).
   */
  stop(): void {
    for (const job of this.activeJobs.values()) {
      if (job.timer) clearTimeout(job.timer);
    }
    this.activeJobs.clear();
  }

  /**
   * Core state machine — runs each step sequentially with confirmation waits.
   */
  private async runMigration(tokenAddress: string): Promise<void> {
    const job: MigrationJob = this.activeJobs.get(tokenAddress) ?? {
      tokenAddress,
      retries: 0,
      timer: null,
    };
    this.activeJobs.set(tokenAddress, job);

    try {
      const tokens = getTokensCollection();
      const token = await tokens.findOne({ _id: tokenAddress });
      if (!token) throw new Error(`Token ${tokenAddress} not found`);

      const currentStep: MigrationStep = (token.migrationStatus as MigrationStep) ?? 'pending';

      if (currentStep === 'pending') {
        await this.stepMintTokens(tokenAddress);
      }

      const afterMint = await tokens.findOne({ _id: tokenAddress });
      if (afterMint?.migrationStatus === 'tokens_minted') {
        await this.stepCreatePool(tokenAddress);
      }

      const afterPool = await tokens.findOne({ _id: tokenAddress });
      if (afterPool?.migrationStatus === 'pool_created') {
        await this.stepListLiquidity(tokenAddress);
      }

      const afterLiquidity = await tokens.findOne({ _id: tokenAddress });
      if (afterLiquidity?.migrationStatus === 'liquidity_listed') {
        await this.stepComplete(tokenAddress);
      }

      this.activeJobs.delete(tokenAddress);
    } catch (err) {
      console.error(`[Migration] Error for ${tokenAddress}:`, err instanceof Error ? err.message : err);
      job.retries++;

      if (job.retries > MAX_RETRIES) {
        console.error(`[Migration] Max retries exceeded for ${tokenAddress} — giving up`);
        this.activeJobs.delete(tokenAddress);
        return;
      }

      const delay = BASE_RETRY_MS * Math.pow(2, job.retries - 1);
      console.log(`[Migration] Retrying ${tokenAddress} in ${delay}ms (attempt ${job.retries}/${MAX_RETRIES})`);
      job.timer = setTimeout(() => {
        // Guard: if the job was removed during shutdown, skip the retry
        if (!this.activeJobs.has(tokenAddress)) return;
        this.runMigration(tokenAddress).catch((retryErr) => {
          console.error(`[Migration] Retry failed for ${tokenAddress}:`, retryErr instanceof Error ? retryErr.message : retryErr);
        });
      }, delay);
    }
  }

  /**
   * Step 1: Call migrate(backendWalletAddress) on the LaunchToken contract.
   */
  private async stepMintTokens(tokenAddress: string): Promise<void> {
    console.log(`[Migration] Step 1/4: Minting liquidity tokens for ${tokenAddress}`);

    const { wallet, provider, network } = await this.getWalletAndProvider();
    const { getContract, ABIDataTypes, BitcoinAbiTypes } = await import('opnet');

    // Custom ABI for migrate() — not in standard OP20
    const migrateAbi: import('opnet').BitcoinInterfaceAbi = [
      {
        name: 'migrate',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [{ name: 'recipient', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'tokenAmount', type: ABIDataTypes.UINT256 }],
      },
    ];

    const contract = getContract(tokenAddress, migrateAbi, provider, network);
    const recipientAddr = wallet.address;

    const sim = await (contract as unknown as {
      migrate: (recipient: typeof recipientAddr) => Promise<import('opnet').CallResult>;
    }).migrate(recipientAddr);

    const receipt = await sim.sendTransaction({
      signer: wallet.keypair,
      mldsaSigner: wallet.mldsaKeypair,
      refundTo: wallet.addresses[0],
      maximumAllowedSatToSpend: MAX_SATS_PER_TX,
      feeRate: 10,
      network,
    });

    const txHash = receipt.transactionId;

    // Query the actual minted token balance from on-chain after confirmation
    await this.waitForConfirmation(provider);

    const { OP_20_ABI } = await import('opnet');
    const balanceContract = getContract(tokenAddress, OP_20_ABI, provider, network);
    const balResult = await (balanceContract as unknown as {
      balanceOf: (addr: typeof recipientAddr) => Promise<{ properties: { balance: bigint } }>;
    }).balanceOf(recipientAddr);
    const mintedTokens = balResult.properties.balance;

    const tokens = getTokensCollection();
    await tokens.updateOne(
      { _id: tokenAddress },
      {
        $set: {
          migrationStatus: 'tokens_minted' as MigrationStep,
          'migrationTxHashes.migrate': txHash,
          migrationLiquidityTokens: mintedTokens.toString(),
          updatedAt: new Date(),
        },
      },
    );

    this.wsService.broadcast('platform', 'migration_progress', {
      tokenAddress,
      step: 1,
      stepName: 'tokens_minted',
      status: 'complete',
    });

    console.log(`[Migration] Step 1 complete for ${tokenAddress}: tx ${txHash}, minted ${mintedTokens}`);
  }

  /**
   * Step 2: Approve tokens + create a NativeSwap pool.
   */
  private async stepCreatePool(tokenAddress: string): Promise<void> {
    console.log(`[Migration] Step 2/4: Creating NativeSwap pool for ${tokenAddress}`);

    const { wallet, provider, network } = await this.getWalletAndProvider();
    const { getContract, NativeSwapAbi, OP_20_ABI } = await import('opnet');

    const tokens = getTokensCollection();
    const token = await tokens.findOne({ _id: tokenAddress });
    if (!token) throw new Error('Token not found');

    // Use the actual minted amount from step 1, not the potentially stale DB virtualTokenSupply
    const liquidityTokens = BigInt(token.migrationLiquidityTokens || token.virtualTokenSupply || '0');
    const walletAddress = wallet.addresses[0];

    // Approve NativeSwap to spend tokens
    const tokenContract = getContract(tokenAddress, OP_20_ABI, provider, network);
    const approveSim = await (tokenContract as unknown as {
      increaseAllowance: (spender: string, amount: bigint) => Promise<import('opnet').CallResult>;
    }).increaseAllowance(config.nativeSwapAddress, liquidityTokens);

    await approveSim.sendTransaction({
      signer: wallet.keypair,
      mldsaSigner: wallet.mldsaKeypair,
      refundTo: walletAddress,
      maximumAllowedSatToSpend: MAX_SATS_PER_TX,
      feeRate: 10,
      network,
    });

    // Wait for approval confirmation (OPNet constraint: approval + pool creation can't be in same block)
    await this.waitForConfirmation(provider);

    // Create the pool
    const nativeSwap = getContract(config.nativeSwapAddress, NativeSwapAbi, provider, network);
    const receiverPubKey = new Uint8Array(wallet.publicKey);

    const createPoolSim = await (nativeSwap as unknown as {
      createPool: (
        token: string,
        floorPrice: bigint,
        initialLiquidity: bigint,
        receiver: Uint8Array,
        receiverStr: string,
        antiBotEnabledFor: bigint,
        antiBotMaximumTokensPerReservation: bigint,
        maxReservesIn5BlocksPercent: bigint,
        poolType: bigint,
        amplification: bigint,
        pegStalenessThreshold: bigint,
      ) => Promise<import('opnet').CallResult>;
    }).createPool(
      tokenAddress,
      BigInt(config.migrationFloorPrice),
      liquidityTokens,
      receiverPubKey,
      walletAddress,
      BigInt(config.migrationAntibotBlocks),
      BigInt(config.migrationMaxTokensPerReservation),
      BigInt(config.migrationMaxReserves5BlocksPercent),
      0n, // poolType: standard
      0n, // amplification
      0n, // pegStalenessThreshold
    );

    const poolReceipt = await createPoolSim.sendTransaction({
      signer: wallet.keypair,
      mldsaSigner: wallet.mldsaKeypair,
      refundTo: walletAddress,
      maximumAllowedSatToSpend: MAX_SATS_PER_TX,
      feeRate: 10,
      network,
    });

    const poolTxHash = poolReceipt.transactionId;

    await tokens.updateOne(
      { _id: tokenAddress },
      {
        $set: {
          migrationStatus: 'pool_created' as MigrationStep,
          'migrationTxHashes.createPool': poolTxHash,
          nativeSwapPoolToken: tokenAddress,
          updatedAt: new Date(),
        },
      },
    );

    this.wsService.broadcast('platform', 'migration_progress', {
      tokenAddress,
      step: 2,
      stepName: 'pool_created',
      status: 'complete',
    });

    console.log(`[Migration] Step 2 complete for ${tokenAddress}: pool tx ${poolTxHash}`);
    await this.waitForConfirmation(provider);
  }

  /**
   * Step 3: Approve tokens + list liquidity on NativeSwap.
   */
  private async stepListLiquidity(tokenAddress: string): Promise<void> {
    console.log(`[Migration] Step 3/4: Listing liquidity for ${tokenAddress}`);

    const { wallet, provider, network } = await this.getWalletAndProvider();
    const { getContract, NativeSwapAbi, OP_20_ABI } = await import('opnet');

    const tokens = getTokensCollection();
    const token = await tokens.findOne({ _id: tokenAddress });
    if (!token) throw new Error('Token not found');

    // Use the actual minted amount from step 1, not the potentially stale DB virtualTokenSupply
    const liquidityTokens = BigInt(token.migrationLiquidityTokens || token.virtualTokenSupply || '0');
    const walletAddress = wallet.addresses[0];

    // Approve NativeSwap to spend tokens for listing
    const tokenContract = getContract(tokenAddress, OP_20_ABI, provider, network);
    const approveSim = await (tokenContract as unknown as {
      increaseAllowance: (spender: string, amount: bigint) => Promise<import('opnet').CallResult>;
    }).increaseAllowance(config.nativeSwapAddress, liquidityTokens);

    await approveSim.sendTransaction({
      signer: wallet.keypair,
      mldsaSigner: wallet.mldsaKeypair,
      refundTo: walletAddress,
      maximumAllowedSatToSpend: MAX_SATS_PER_TX,
      feeRate: 10,
      network,
    });

    await this.waitForConfirmation(provider);

    // List liquidity
    const nativeSwap = getContract(config.nativeSwapAddress, NativeSwapAbi, provider, network);
    const receiverPubKey = new Uint8Array(wallet.publicKey);

    const listSim = await (nativeSwap as unknown as {
      listLiquidity: (
        token: string,
        receiver: Uint8Array,
        receiverStr: string,
        amount: bigint,
        priority: boolean,
      ) => Promise<import('opnet').CallResult>;
    }).listLiquidity(
      tokenAddress,
      receiverPubKey,
      walletAddress,
      liquidityTokens,
      true, // priority queue placement
    );

    const listReceipt = await listSim.sendTransaction({
      signer: wallet.keypair,
      mldsaSigner: wallet.mldsaKeypair,
      refundTo: walletAddress,
      maximumAllowedSatToSpend: MAX_SATS_PER_TX,
      feeRate: 10,
      network,
    });

    const listTxHash = listReceipt.transactionId;

    await tokens.updateOne(
      { _id: tokenAddress },
      {
        $set: {
          migrationStatus: 'liquidity_listed' as MigrationStep,
          'migrationTxHashes.listLiquidity': listTxHash,
          updatedAt: new Date(),
        },
      },
    );

    this.wsService.broadcast('platform', 'migration_progress', {
      tokenAddress,
      step: 3,
      stepName: 'liquidity_listed',
      status: 'complete',
    });

    console.log(`[Migration] Step 3 complete for ${tokenAddress}: list tx ${listTxHash}`);
    await this.waitForConfirmation(provider);
  }

  /**
   * Step 4: Mark migration as complete.
   */
  private async stepComplete(tokenAddress: string): Promise<void> {
    const tokens = getTokensCollection();
    await tokens.updateOne(
      { _id: tokenAddress },
      {
        $set: {
          status: 'migrated',
          migrationStatus: 'complete' as MigrationStep,
          updatedAt: new Date(),
        },
      },
    );

    this.wsService.broadcast(`token:price:${tokenAddress}`, 'token_migrated', {
      tokenAddress,
    });
    this.wsService.broadcast('platform', 'token_migrated', { tokenAddress });

    this.wsService.broadcast('platform', 'migration_progress', {
      tokenAddress,
      step: 4,
      stepName: 'complete',
      status: 'complete',
    });

    console.log(`[Migration] Migration complete for ${tokenAddress}`);
  }

  /**
   * Initialize wallet and provider from config (cached per instance).
   */
  private async getWalletAndProvider(): Promise<WalletAndProvider> {
    if (this.cachedWalletAndProvider) return this.cachedWalletAndProvider;

    const { JSONRpcProvider } = await import('opnet');
    const { networks } = await import('@btc-vision/bitcoin');
    const { Mnemonic } = await import('@btc-vision/transaction');

    const network = config.network === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
    const provider = new JSONRpcProvider({ url: config.opnetRpcUrl, network });

    const mnemonic = new Mnemonic(config.migrationWalletMnemonic, undefined, network);
    const wallet = mnemonic.derive();

    this.cachedWalletAndProvider = { wallet, provider, network } as WalletAndProvider;
    return this.cachedWalletAndProvider;
  }

  /**
   * Wait for next block confirmation.
   */
  private async waitForConfirmation(provider: import('opnet').JSONRpcProvider): Promise<void> {
    const startBlock = await provider.getBlockNumber();
    const maxWait = 120_000; // 2 minutes
    const pollInterval = 3_000;
    const deadline = Date.now() + maxWait;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock > startBlock) return;
    }

    throw new Error('Timeout waiting for block confirmation');
  }
}

/**
 * OPump Contract Deployment Script
 *
 * Deploys OPumpFactory to OPNet testnet.
 *
 * Usage:
 *   MNEMONIC="your 24 word seed phrase" node scripts/deploy.mjs
 *
 * Options:
 *   NETWORK=testnet|mainnet  (default: testnet)
 *   FEE_RATE=5               (default: 5 sat/vB)
 *
 * Prerequisites:
 *   - Built WASM files in build/ (run `npm run build:all`)
 *   - Funded wallet with tBTC on OPNet testnet
 */

import { readFileSync } from 'fs';
import {
    AddressTypes,
    Mnemonic,
    MLDSASecurityLevel,
    TransactionFactory,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

// --- Configuration ---

const MNEMONIC = (process.env.MNEMONIC || '').trim();
if (!MNEMONIC) {
    console.error('[Deploy] ERROR: MNEMONIC env var is required.');
    console.error('  Usage: MNEMONIC="your 24 word seed phrase" node scripts/deploy.mjs');
    process.exit(1);
}

const NETWORK_NAME = process.env.NETWORK || 'testnet';
const FEE_RATE = parseInt(process.env.FEE_RATE || '5', 10);

const NETWORK_CONFIG = {
    testnet: {
        network: networks.opnetTestnet,
        rpcUrl: 'https://testnet.opnet.org',
    },
    mainnet: {
        network: networks.bitcoin,
        rpcUrl: 'https://api.opnet.org',
    },
};

const netConfig = NETWORK_CONFIG[NETWORK_NAME];
if (!netConfig) {
    console.error(`[Deploy] Unknown network: ${NETWORK_NAME}. Use "testnet" or "mainnet".`);
    process.exit(1);
}

// --- Check build artifacts ---

let factoryBytecode;
try {
    factoryBytecode = readFileSync('./build/OPumpFactory.wasm');
    console.log(`[Deploy] OPumpFactory.wasm loaded (${factoryBytecode.length} bytes)`);
} catch {
    console.error('[Deploy] build/OPumpFactory.wasm not found. Run `npm run build:all` first.');
    process.exit(1);
}

// --- Initialize wallet & provider ---

console.log(`[Deploy] Network: ${NETWORK_NAME}`);
console.log(`[Deploy] RPC: ${netConfig.rpcUrl}`);
console.log(`[Deploy] Fee rate: ${FEE_RATE} sat/vB`);

const provider = new JSONRpcProvider({
    url: netConfig.rpcUrl,
    network: netConfig.network,
});

const mnemonic = new Mnemonic(
    MNEMONIC,
    '',
    netConfig.network,
    MLDSASecurityLevel.LEVEL2,
);
const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);

console.log(`[Deploy] Deployer address: ${wallet.p2tr}`);

// --- Fetch UTXOs ---

console.log('[Deploy] Fetching UTXOs...');
const utxos = await provider.utxoManager.getUTXOs({
    address: wallet.p2tr,
});

if (utxos.length === 0) {
    console.error('[Deploy] No UTXOs found. Fund this address with tBTC first:');
    console.error(`  ${wallet.p2tr}`);
    process.exit(1);
}

const totalSats = utxos.reduce((sum, u) => sum + u.value, 0n);
console.log(`[Deploy] Found ${utxos.length} UTXOs (${totalSats} sats)`);

// --- Deploy OPumpFactory ---

console.log('[Deploy] Deploying OPumpFactory...');

const challenge = await provider.getChallenge();

const factory = new TransactionFactory();

const deploymentParams = {
    from: wallet.p2tr,
    utxos: utxos,
    signer: wallet.keypair,
    mldsaSigner: wallet.mldsaKeypair,
    network: netConfig.network,
    feeRate: FEE_RATE,
    priorityFee: 0n,
    gasSatFee: 10_000n,
    bytecode: new Uint8Array(factoryBytecode),
    challenge: challenge,
    linkMLDSAPublicKeyToAddress: true,
    revealMLDSAPublicKey: true,
};

const deployment = await factory.signDeployment(deploymentParams);

console.log(`[Deploy] Contract address: ${deployment.contractAddress}`);
console.log('[Deploy] Broadcasting funding TX...');

const fundingResult = await provider.sendRawTransaction(deployment.transaction[0]);
if (!fundingResult.success) {
    console.error(`[Deploy] Funding TX broadcast FAILED: ${fundingResult.error ?? 'unknown error'}`);
    console.error('[Deploy] Full response:', JSON.stringify(fundingResult));
    process.exit(1);
}
console.log(`[Deploy] Funding TX ID: ${fundingResult.result}`);

console.log('[Deploy] Broadcasting reveal TX...');
const revealResult = await provider.sendRawTransaction(deployment.transaction[1]);
if (!revealResult.success) {
    console.error(`[Deploy] Reveal TX broadcast FAILED: ${revealResult.error ?? 'unknown error'}`);
    console.error('[Deploy] Full response:', JSON.stringify(revealResult));
    process.exit(1);
}
console.log(`[Deploy] Reveal TX ID: ${revealResult.result}`);

// --- Done ---

console.log('');
console.log('========================================');
console.log('  OPumpFactory deployed successfully!');
console.log('========================================');
console.log(`  Contract address: ${deployment.contractAddress}`);
console.log(`  Funding TX:      ${fundingResult.result}`);
console.log(`  Reveal TX:       ${revealResult.result}`);
console.log('');
console.log('  Next steps:');
console.log(`  1. Update frontend/.env: VITE_FACTORY_ADDRESS=${deployment.contractAddress}`);
console.log('  2. Wait for confirmation (~1 block)');
console.log('  3. Start the frontend: cd ../frontend && npm run dev');
console.log('');

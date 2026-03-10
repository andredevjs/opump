/**
 * OPump Contract Deployment Script
 *
 * Deploys OPumpFactory to OPNet testnet.
 * Usage: node scripts/deploy.mjs
 *
 * Prerequisites:
 * - Built WASM files in build/
 * - OPNet CLI configured with testnet wallet
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const NETWORK = process.env.NETWORK || 'testnet';

console.log(`[Deploy] Deploying OPump contracts to ${NETWORK}...`);

// Check build artifacts exist
try {
  readFileSync('./build/OPumpFactory.wasm');
  readFileSync('./build/LaunchToken.wasm');
  console.log('[Deploy] Build artifacts found');
} catch {
  console.error('[Deploy] Build artifacts not found. Run `npm run build && npm run build:factory` first.');
  process.exit(1);
}

console.log('[Deploy] Deploy contracts using OPNet CLI:');
console.log('  opnet deploy --wasm build/OPumpFactory.wasm --network testnet');
console.log('  opnet deploy --wasm build/LaunchToken.wasm --network testnet');
console.log('');
console.log('[Deploy] After deployment, update FACTORY_ADDRESS in backend/.env');

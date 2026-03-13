import 'dotenv/config';

export interface Config {
  port: number;
  mongoUrl: string;
  mongoDbName: string;
  opnetRpcUrl: string;
  network: string;
  factoryAddress: string;
  indexerPollMs: number;
  mempoolPollMs: number;
  reserveSyncIntervalMs: number;
  s3Bucket: string;
  s3Region: string;
  s3Endpoint: string;
  s3AccessKey: string;
  s3SecretKey: string;
  s3PublicUrl: string;
  // Migration
  nativeSwapAddress: string;
  migrationWalletMnemonic: string;
  migrationFloorPrice: number;
  migrationAntibotBlocks: number;
  migrationMaxTokensPerReservation: number;
  migrationMaxReserves5BlocksPercent: number;
}

function _required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config: Config = {
  port: parseInt(optional('PORT', '9850'), 10),
  mongoUrl: optional('MONGO_URL', 'mongodb://localhost:27017'),
  mongoDbName: optional('MONGO_DB_NAME', 'opump'),
  opnetRpcUrl: optional('OPNET_RPC_URL', 'https://testnet.opnet.org'),
  network: optional('NETWORK', 'testnet'),
  factoryAddress: optional('FACTORY_ADDRESS', ''),
  indexerPollMs: parseInt(optional('INDEXER_POLL_MS', '5000'), 10),
  mempoolPollMs: parseInt(optional('MEMPOOL_POLL_MS', '800'), 10),
  reserveSyncIntervalMs: parseInt(optional('RESERVE_SYNC_INTERVAL_MS', '60000'), 10),
  s3Bucket: optional('S3_BUCKET', ''),
  s3Region: optional('S3_REGION', 'auto'),
  s3Endpoint: optional('S3_ENDPOINT', ''),
  s3AccessKey: optional('S3_ACCESS_KEY', ''),
  s3SecretKey: optional('S3_SECRET_KEY', ''),
  s3PublicUrl: optional('S3_PUBLIC_URL', ''),
  // Migration
  nativeSwapAddress: optional('NATIVE_SWAP_ADDRESS', '0x035884f9ac2b6ae75d7778553e7d447899e9a82e247d7ced48f22aa102681e70'),
  migrationWalletMnemonic: optional('MIGRATION_WALLET_MNEMONIC', ''),
  migrationFloorPrice: parseInt(optional('MIGRATION_FLOOR_PRICE', '1000'), 10),
  migrationAntibotBlocks: parseInt(optional('MIGRATION_ANTIBOT_BLOCKS', '10'), 10),
  migrationMaxTokensPerReservation: parseInt(optional('MIGRATION_MAX_TOKENS_PER_RESERVATION', '0'), 10),
  migrationMaxReserves5BlocksPercent: parseInt(optional('MIGRATION_MAX_RESERVES_5BLOCKS_PERCENT', '50'), 10),
};

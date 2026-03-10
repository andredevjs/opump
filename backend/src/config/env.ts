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
};

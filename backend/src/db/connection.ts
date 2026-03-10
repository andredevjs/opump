import { MongoClient, Db } from 'mongodb';
import { config } from '../config/env.js';

let client: MongoClient | null = null;
let db: Db | null = null;

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

export async function connectDb(): Promise<Db> {
  if (db) return db;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      client = new MongoClient(config.mongoUrl, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      await client.connect();
      db = client.db(config.mongoDbName);

      client.on('close', () => {
        console.warn('[DB] MongoDB connection lost');
      });

      console.log(`[DB] Connected to MongoDB: ${config.mongoDbName}`);
      return db;
    } catch (err) {
      console.error(`[DB] Connection attempt ${attempt}/${MAX_RETRIES} failed:`, err instanceof Error ? err.message : err);
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to connect to MongoDB after ${MAX_RETRIES} attempts`, { cause: err });
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }

  throw new Error('Unreachable');
}

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not connected. Call connectDb() first.');
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('[DB] Disconnected from MongoDB');
  }
}

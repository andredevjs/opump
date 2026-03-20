// Global test setup — sets env vars and imports mocks

// Set env vars before any module loads
process.env.UPSTASH_REDIS_REST_URL = 'http://fake-redis';
process.env.UPSTASH_REDIS_REST_TOKEN = 'fake-token';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.OPNET_RPC_URL = 'http://fake-rpc';
process.env.NETWORK = 'testnet';
process.env.ADMIN_SECRET = 'test-admin-secret';
process.env.INDEXER_API_KEY = 'test-indexer-key';

// Import mocks so vi.mock() calls are registered
import './mocks/redis-mock.js';
import './mocks/opnet-mock.js';
import './mocks/blobs-mock.js';

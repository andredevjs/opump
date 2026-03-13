import HyperExpress from '@btc-vision/hyper-express';
import { config } from './config/env.js';
import { connectDb, closeDb } from './db/connection.js';
import { ensureIndexes } from './db/indexes.js';
import { registerTokenRoutes, setOptimisticService } from './routes/tokens.js';
import { registerSimulateRoutes } from './routes/simulate.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerStatsRoutes } from './routes/stats.js';
import { registerUploadRoutes } from './routes/upload.js';
import { rateLimit } from './middleware/rateLimit.js';
import { WebSocketService } from './services/WebSocketService.js';
import { OptimisticStateService } from './services/OptimisticStateService.js';
import { IndexerService } from './services/IndexerService.js';
import { MempoolService } from './services/MempoolService.js';
import { MigrationService } from './services/MigrationService.js';

const app = new HyperExpress.Server();

// Services
const optimisticService = new OptimisticStateService();
const wsService = new WebSocketService(app);
const indexerService = new IndexerService(wsService, optimisticService);
const mempoolService = new MempoolService(wsService, optimisticService);
const migrationService = new MigrationService(wsService);
indexerService.setMigrationService(migrationService);

export { optimisticService };

// Rate limiting
app.use(rateLimit);

// CORS middleware
app.use((req, res, next) => {
  const allowedOrigin = process.env.FRONTEND_URL;
  if (!allowedOrigin && process.env.NODE_ENV === 'production') {
    console.warn('[CORS] FRONTEND_URL not set in production — allowing all origins is insecure!');
  }
  res.header('Access-Control-Allow-Origin', allowedOrigin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Global error handler — no stack trace leaks
app.set_error_handler((req, res, error) => {
  console.error('[ERROR]', error.message);
  res.status(500).json({
    error: 'InternalServerError',
    message: 'An unexpected error occurred',
    statusCode: 500,
  });
});

async function start(): Promise<void> {
  // Connect to MongoDB
  await connectDb();
  await ensureIndexes();

  // Register routes
  setOptimisticService(optimisticService);
  registerTokenRoutes(app);
  registerSimulateRoutes(app);
  registerProfileRoutes(app);
  registerStatsRoutes(app);
  registerUploadRoutes(app);

  // Initialize WebSocket
  wsService.init();

  // Start background services
  await indexerService.start();
  mempoolService.start();
  await migrationService.resume();

  // Start HTTP server
  await app.listen(config.port);
  console.log(`[SERVER] OPump backend listening on port ${config.port}`);
}

// Graceful shutdown
function shutdown(): void {
  console.log('[SERVER] Shutting down...');
  indexerService.stop();
  mempoolService.stop();
  migrationService.stop();
  wsService.stop();
  closeDb()
    .then(() => {
      app.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SERVER] Error during shutdown:', err);
      process.exit(1);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((err) => {
  console.error('[SERVER] Failed to start:', err);
  process.exit(1);
});

export { app };

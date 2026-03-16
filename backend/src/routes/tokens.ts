import type HyperExpress from '@btc-vision/hyper-express';
import { getTokensCollection } from '../db/models/Token.js';
import { getTradesCollection } from '../db/models/Trade.js';
import { getPlatformStatsCollection } from '../db/models/PlatformStats.js';
import type { TokenListQuery, CreateTokenRequest, TimeframeKey, OHLCVCandle } from '../../../shared/types/api.js';
import type { TokenStatus } from '../../../shared/types/token.js';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  GRADUATION_THRESHOLD_SATS,
} from '../../../shared/constants/bonding-curve.js';
import { toDisplayPrice } from '../utils/price.js';
import type { Filter } from 'mongodb';
import type { TokenDocument } from '../../../shared/types/token.js';
import type { OptimisticStateService } from '../services/OptimisticStateService.js';
import type { MempoolService } from '../services/MempoolService.js';
import type { WebSocketService } from '../services/WebSocketService.js';
import type { BroadcastDebouncer } from '../services/BroadcastDebouncer.js';
import { verifyTokenOnChain } from '../services/on-chain-verify.js';

/**
 * Calculate the 24h price change in basis points (1 bps = 0.01%).
 * Compares current price to the price at or closest to 24 hours ago.
 */
async function getChange24hBps(tokenAddress: string, currentPriceSats: string): Promise<number> {
  const trades = getTradesCollection();
  const currentPrice = parseFloat(currentPriceSats);
  if (!currentPrice || isNaN(currentPrice)) return 0;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find the most recent trade at or before 24h ago
  const refTrade = await trades.findOne(
    { tokenAddress, createdAt: { $lte: cutoff } },
    { sort: { createdAt: -1 }, projection: { pricePerToken: 1 } },
  );

  let refPrice: number;

  if (refTrade) {
    refPrice = parseFloat(refTrade.pricePerToken);
  } else {
    // Token is less than 24h old — use the earliest trade as reference
    const oldest = await trades.findOne(
      { tokenAddress },
      { sort: { createdAt: 1 }, projection: { pricePerToken: 1 } },
    );
    if (!oldest) return 0;
    refPrice = parseFloat(oldest.pricePerToken);
  }

  if (!refPrice || isNaN(refPrice)) return 0;
  return Math.round(((currentPrice - refPrice) / refPrice) * 10000);
}

// Per-wallet rate limiter for token creation (max 3 per hour per wallet)
const TOKEN_CREATE_WINDOW_MS = 3_600_000; // 1 hour
const TOKEN_CREATE_MAX = 3;
const walletCreateCounts = new Map<string, { count: number; resetAt: number }>();

function checkWalletRateLimit(walletAddress: string): boolean {
  const now = Date.now();
  const entry = walletCreateCounts.get(walletAddress);
  if (!entry || now > entry.resetAt) {
    walletCreateCounts.set(walletAddress, { count: 1, resetAt: now + TOKEN_CREATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= TOKEN_CREATE_MAX;
}

const ADDRESS_REGEX = /^(?:(?:bc1|bcrt1|tb1|op1|opt1)[a-zA-Z0-9]{20,64}|0x[a-fA-F0-9]{40,64})$/;

/**
 * Validate a CreateTokenRequest body. Returns an error message string if invalid, or null if valid.
 */
function validateCreateTokenRequest(body: CreateTokenRequest): string | null {
  // Required fields
  if (
    typeof body.name !== 'string' || !body.name ||
    typeof body.symbol !== 'string' || !body.symbol ||
    typeof body.contractAddress !== 'string' || !body.contractAddress ||
    typeof body.creatorAddress !== 'string' || !body.creatorAddress
  ) {
    return 'Missing required fields: name, symbol, contractAddress, creatorAddress (must be strings)';
  }

  // Optional field types
  if (body.description !== undefined && typeof body.description !== 'string') {
    return 'description must be a string';
  }
  if (body.deployTxHash !== undefined && typeof body.deployTxHash !== 'string') {
    return 'deployTxHash must be a string';
  }

  // Field lengths
  if (body.name.length > 50) return 'Name must be 50 characters or less';
  if (body.symbol.length > 10) return 'Symbol must be 10 characters or less';
  if (body.description && body.description.length > 500) return 'Description must be 500 characters or less';
  if (body.imageUrl && body.imageUrl.length > 2048) return 'Image URL must be under 2048 characters';

  // Address formats
  if (!ADDRESS_REGEX.test(body.contractAddress)) return 'Invalid contract address format';
  if (!ADDRESS_REGEX.test(body.creatorAddress)) return 'Invalid creator address format';

  // BPS values
  const bpsConfig = body.config || {};
  if (bpsConfig.creatorAllocationBps !== undefined && (bpsConfig.creatorAllocationBps < 0 || bpsConfig.creatorAllocationBps > 1000)) {
    return 'Creator allocation must be 0-1000 bps (0-10%)';
  }
  if (bpsConfig.buyTaxBps !== undefined && (bpsConfig.buyTaxBps < 0 || bpsConfig.buyTaxBps > 300)) {
    return 'Buy tax must be 0-300 bps (0-3%)';
  }
  if (bpsConfig.sellTaxBps !== undefined && (bpsConfig.sellTaxBps < 0 || bpsConfig.sellTaxBps > 500)) {
    return 'Sell tax must be 0-500 bps (0-5%)';
  }

  // deployTxHash required for on-chain verification
  if (!body.deployTxHash || typeof body.deployTxHash !== 'string' || body.deployTxHash.length < 64) {
    return 'deployTxHash is required and must be a valid transaction hash (64+ hex chars)';
  }

  return null;
}

let _cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function stopTokenRoutesCleanup(): void {
  if (_cleanupInterval) {
    clearInterval(_cleanupInterval);
    _cleanupInterval = null;
  }
}

export function registerTokenRoutes(app: HyperExpress.Server, optimisticService?: OptimisticStateService, mempoolService?: MempoolService, wsService?: WebSocketService, debouncer?: BroadcastDebouncer): void {
  // Start cleanup interval for wallet rate limit entries (every 10 minutes)
  if (_cleanupInterval) clearInterval(_cleanupInterval);
  _cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [wallet, entry] of walletCreateCounts) {
      if (now > entry.resetAt) {
        walletCreateCounts.delete(wallet);
      }
    }
    // Cap map size to prevent unbounded memory growth
    if (walletCreateCounts.size > 10_000) {
      walletCreateCounts.clear();
    }
  }, 600_000);
  // GET /v1/tokens — list tokens with pagination, filter, sort, search
  app.get('/v1/tokens', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const VALID_STATUSES = ['active', 'graduated', 'migrating', 'migrated', 'new', 'all'];
    const statusRaw = String(req.query.status || 'all');
    if (!VALID_STATUSES.includes(statusRaw)) {
      res.status(400).json({ error: 'BadRequest', message: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}`, statusCode: 400 });
      return;
    }
    const status = statusRaw as TokenListQuery['status'];
    const search = String(req.query.search || '');
    const sort = String(req.query.sort || 'newest') as TokenListQuery['sort'];
    const order = req.query.order === 'asc' ? 1 : -1;

    const tokens = getTokensCollection();
    const filter: Filter<TokenDocument> = {};

    if (status && status !== 'all') {
      if (status === 'new') {
        // "New" = active tokens created in the last 24 hours
        filter.status = 'active';
        filter.createdAt = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      } else if (status === 'migrated') {
        // "On DEX" = tokens that graduated, are migrating, or have migrated
        filter.status = { $in: ['graduated', 'migrating', 'migrated'] } as any;
      } else {
        filter.status = status as TokenStatus;
      }
    }

    if (search) {
      // Sanitize search input: strip special chars, limit length
      const cleanSearch = search.replace(/[^\w\s$-]/g, '').trim().slice(0, 100);
      if (cleanSearch) {
        filter.$text = { $search: cleanSearch };
      }
    }

    const sortField: Record<string, 1 | -1> = {};
    switch (sort) {
      case 'volume24h':
        sortField.volume24h = order;
        break;
      case 'marketCap':
        sortField.marketCapSats = order;
        break;
      case 'price':
        sortField.currentPriceSats = order;
        break;
      case 'newest':
      default:
        sortField.deployBlock = -1;
        break;
    }

    const skip = (page - 1) * limit;
    const [results, total] = await Promise.all([
      tokens.find(filter).sort(sortField).skip(skip).limit(limit).toArray(),
      tokens.countDocuments(filter),
    ]);

    // Compute 24h change for each token in parallel
    const changes = await Promise.all(
      results.map((t) => getChange24hBps(t._id, t.currentPriceSats)),
    );
    const enriched = results.map((t, i) => ({ ...t, priceChange24hBps: changes[i] }));

    res.json({
      tokens: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // GET /v1/tokens/:address — token detail
  app.get('/v1/tokens/:address', async (req, res) => {
    const { address } = req.params;
    const tokens = getTokensCollection();
    const token = await tokens.findOne({ _id: address });

    if (!token) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Token not found',
        statusCode: 404,
      });
      return;
    }

    res.json(token);
  });

  // GET /v1/tokens/:address/trades — trade history
  app.get('/v1/tokens/:address/trades', async (req, res) => {
    const { address } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10)));

    const trades = getTradesCollection();
    const skip = (page - 1) * limit;

    const [results, total] = await Promise.all([
      trades
        .find({ tokenAddress: address })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      trades.countDocuments({ tokenAddress: address }),
    ]);

    res.json({
      trades: results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // GET /v1/tokens/:address/price — current price and reserves (with optimistic state)
  app.get('/v1/tokens/:address/price', async (req, res) => {
    const { address } = req.params;
    const tokens = getTokensCollection();
    const token = await tokens.findOne({ _id: address });

    if (!token) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Token not found',
        statusCode: 404,
      });
      return;
    }

    // Use optimistic state if available
    if (optimisticService && optimisticService.hasPending(address)) {
      const optimistic = optimisticService.getOptimisticPrice(address);
      const displayPrice = toDisplayPrice(optimistic.reserves.virtualBtcReserve, optimistic.reserves.virtualTokenSupply);
      const change24hBps = await getChange24hBps(address, displayPrice);
      res.json({
        currentPriceSats: displayPrice,
        virtualBtcReserve: optimistic.reserves.virtualBtcReserve.toString(),
        virtualTokenSupply: optimistic.reserves.virtualTokenSupply.toString(),
        realBtcReserve: optimistic.reserves.realBtcReserve.toString(),
        isOptimistic: true,
        pendingBuySats: optimistic.pendingBuySats.toString(),
        pendingSellTokens: optimistic.pendingSellTokens.toString(),
        change24hBps,
      });
      return;
    }

    const change24hBps = await getChange24hBps(address, token.currentPriceSats);
    res.json({
      currentPriceSats: token.currentPriceSats,
      virtualBtcReserve: token.virtualBtcReserve,
      virtualTokenSupply: token.virtualTokenSupply,
      realBtcReserve: token.realBtcReserve,
      isOptimistic: false,
      change24hBps,
    });
  });

  // GET /v1/tokens/:address/ohlcv — OHLCV candle data aggregated from trades
  app.get('/v1/tokens/:address/ohlcv', async (req, res) => {
    const { address } = req.params;
    const timeframe = String(req.query.timeframe || '15m');
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || '200'), 10)));

    const TIMEFRAME_SECONDS: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '1h': 3600,
      '4h': 14400,
      '1d': 86400,
    };

    const intervalSeconds = TIMEFRAME_SECONDS[timeframe];
    if (!intervalSeconds) {
      res.status(400).json({
        error: 'BadRequest',
        message: `Invalid timeframe "${timeframe}". Valid: 1m, 5m, 15m, 1h, 4h, 1d`,
        statusCode: 400,
      });
      return;
    }

    const trades = getTradesCollection();

    // Aggregate trades into OHLCV buckets
    // Uses blockTimestamp (falls back to createdAt) for time bucketing
    const pipeline = [
      { $match: { tokenAddress: address } },
      {
        $addFields: {
          ts: {
            $toLong: {
              $ifNull: ['$blockTimestamp', '$createdAt'],
            },
          },
          priceNum: { $toDouble: '$pricePerToken' },
          volNum: { $toDouble: '$btcAmount' },
        },
      },
      {
        $addFields: {
          // Convert milliseconds to seconds, then bucket
          tsSec: { $floor: { $divide: ['$ts', 1000] } },
        },
      },
      {
        $addFields: {
          bucket: {
            $multiply: [
              { $floor: { $divide: ['$tsSec', intervalSeconds] } },
              intervalSeconds,
            ],
          },
        },
      },
      { $sort: { ts: 1 as const } },
      {
        $group: {
          _id: '$bucket',
          open: { $first: '$priceNum' },
          high: { $max: '$priceNum' },
          low: { $min: '$priceNum' },
          close: { $last: '$priceNum' },
          volume: { $sum: '$volNum' },
        },
      },
      { $sort: { _id: -1 as const } },
      { $limit: limit },
      { $sort: { _id: 1 as const } },
    ];

    const results = await trades.aggregate(pipeline).toArray();

    const candles: OHLCVCandle[] = results.map((r) => ({
      time: r._id as number,
      open: r.open as number,
      high: r.high as number,
      low: r.low as number,
      close: r.close as number,
      volume: r.volume as number,
    }));

    res.json({
      candles,
      timeframe: timeframe as TimeframeKey,
      tokenAddress: address,
    });
  });

  // POST /v1/trades — submit a trade from the frontend (mempool-first fast path)
  app.post('/v1/trades', async (req, res) => {
    let body: { txHash: string; tokenAddress: string; type: string; traderAddress: string; btcAmount: string; tokenAmount: string; pricePerToken: string };
    try {
      body = await req.json();
    } catch {
      res.status(400).json({ error: 'BadRequest', message: 'Invalid JSON body', statusCode: 400 });
      return;
    }

    if (!body.txHash || !body.tokenAddress || !body.type || !body.traderAddress) {
      res.status(400).json({ error: 'BadRequest', message: 'Missing required fields', statusCode: 400 });
      return;
    }

    if (body.type !== 'buy' && body.type !== 'sell') {
      res.status(400).json({ error: 'BadRequest', message: 'type must be buy or sell', statusCode: 400 });
      return;
    }

    const trades = getTradesCollection();
    const existing = await trades.findOne({ _id: body.txHash });
    if (existing) {
      // Already tracked — return 200 (idempotent)
      res.json(existing);
      return;
    }

    const btcAmount = body.btcAmount || '0';
    const tokenAmount = body.tokenAmount || '0';
    const pricePerToken = body.pricePerToken || '0';

    // Delegate to MempoolService when available — it handles insert, WS broadcast,
    // optimistic state, and stat updates atomically (dedup via knownPendingTxs)
    if (mempoolService) {
      await mempoolService.registerPendingTrade(
        body.txHash,
        body.tokenAddress,
        body.type as 'buy' | 'sell',
        body.traderAddress,
        btcAmount,
        tokenAmount,
        pricePerToken,
      );
    } else {
      const now = new Date();
      await trades.insertOne({
        _id: body.txHash,
        tokenAddress: body.tokenAddress,
        type: body.type as 'buy' | 'sell',
        traderAddress: body.traderAddress,
        btcAmount,
        tokenAmount,
        pricePerToken,
        fees: { platform: '0', creator: '0', minter: '0', flywheel: '0' },
        priceImpactBps: 0,
        status: 'pending' as const,
        createdAt: now,
      });

      // T025: Broadcast trade and price update when mempoolService is unavailable
      if (wsService) {
        wsService.broadcast(`token:trades:${body.tokenAddress}`, 'new_trade', {
          txHash: body.txHash,
          type: body.type,
          traderAddress: body.traderAddress,
          btcAmount,
          tokenAmount,
          status: 'pending',
          pricePerToken,
        });

        // Read token reserves and broadcast price_update
        const tokenDoc = await getTokensCollection().findOne({ _id: body.tokenAddress });
        if (tokenDoc) {
          wsService.broadcast(`token:price:${body.tokenAddress}`, 'price_update', {
            currentPriceSats: pricePerToken || tokenDoc.currentPriceSats,
            virtualBtcReserve: tokenDoc.virtualBtcReserve,
            virtualTokenSupply: tokenDoc.virtualTokenSupply,
            realBtcReserve: tokenDoc.realBtcReserve,
            isOptimistic: false,
          });
        }
      }
    }

    const doc = await trades.findOne({ _id: body.txHash });
    res.status(201).json(doc);
  });

  // POST /v1/tokens — register a new token
  app.post('/v1/tokens', async (req, res) => {
    let body: CreateTokenRequest;
    try {
      body = await req.json() as CreateTokenRequest;
    } catch {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid JSON body',
        statusCode: 400,
      });
      return;
    }

    const validationError = validateCreateTokenRequest(body);
    if (validationError) {
      res.status(400).json({ error: 'BadRequest', message: validationError, statusCode: 400 });
      return;
    }

    // Rate-limit token creation per wallet (3 per hour)
    if (!checkWalletRateLimit(body.creatorAddress)) {
      res.status(429).json({
        error: 'TooManyRequests',
        message: 'Token creation rate limit exceeded for this wallet. Max 3 per hour.',
        statusCode: 429,
      });
      return;
    }

    // Full on-chain verification: receipt, deployer, contract type, and config
    let verifiedDeployBlock = 0;
    try {
      const verification = await verifyTokenOnChain(
        body.contractAddress,
        body.creatorAddress,
        body.deployTxHash,
        {
          creatorAllocationBps: body.config?.creatorAllocationBps ?? 0,
          buyTaxBps: body.config?.buyTaxBps ?? 0,
          sellTaxBps: body.config?.sellTaxBps ?? 0,
        },
      );

      if (!verification.valid) {
        res.status(400).json({
          error: 'BadRequest',
          message: verification.error || 'On-chain verification failed.',
          statusCode: 400,
        });
        return;
      }

      verifiedDeployBlock = verification.deployBlock ?? 0;
    } catch (verifyErr) {
      console.warn('[Tokens] On-chain verification failed:', verifyErr instanceof Error ? verifyErr.message : verifyErr);
      if (process.env.NODE_ENV === 'production') {
        res.status(503).json({
          error: 'ServiceUnavailable',
          message: 'On-chain verification unavailable. Try again later.',
          statusCode: 503,
        });
        return;
      }
      // Allow registration to proceed in development only
    }

    const tokens = getTokensCollection();

    // Check for duplicate
    const existing = await tokens.findOne({ _id: body.contractAddress });
    if (existing) {
      res.status(409).json({
        error: 'Conflict',
        message: 'Token already registered',
        statusCode: 409,
      });
      return;
    }

    const now = new Date();
    // Normalize to sats per whole token (bigint-safe)
    const initialPrice = toDisplayPrice(INITIAL_VIRTUAL_BTC_SATS, INITIAL_VIRTUAL_TOKEN_SUPPLY);

    const tokenDoc: TokenDocument = {
      _id: body.contractAddress,
      name: body.name,
      symbol: body.symbol,
      description: body.description || '',
      imageUrl: body.imageUrl || '',
      socials: body.socials || {},
      creatorAddress: body.creatorAddress,
      contractAddress: body.contractAddress,
      virtualBtcReserve: INITIAL_VIRTUAL_BTC_SATS.toString(),
      virtualTokenSupply: INITIAL_VIRTUAL_TOKEN_SUPPLY.toString(),
      kConstant: K_CONSTANT.toString(),
      realBtcReserve: '0',
      config: {
        creatorAllocationBps: body.config?.creatorAllocationBps || 0,
        buyTaxBps: body.config?.buyTaxBps || 0,
        sellTaxBps: body.config?.sellTaxBps || 0,
        flywheelDestination: body.config?.flywheelDestination || 'burn',
        graduationThreshold: GRADUATION_THRESHOLD_SATS.toString(),
      },
      status: 'active',
      currentPriceSats: initialPrice,
      volume24h: '0',
      volumeTotal: '0',
      marketCapSats: '0',
      tradeCount: 0,
      holderCount: 0,
      deployBlock: verifiedDeployBlock,
      deployTxHash: body.deployTxHash,
      createdAt: now,
      updatedAt: now,
    };

    await tokens.insertOne(tokenDoc);
    res.status(201).json(tokenDoc);

    // T016: Broadcast updated platform stats (increment totalTokens in-memory)
    if (debouncer) {
      try {
        const platformStats = getPlatformStatsCollection();
        const currentPlatform = await platformStats.findOne({ _id: 'current' });
        if (currentPlatform) {
          debouncer.schedulePlatformStats({
            totalTokens: (currentPlatform.totalTokens ?? 0) + 1,
            totalTrades: currentPlatform.totalTrades ?? 0,
            totalVolumeSats: currentPlatform.totalVolumeSats || '0',
            totalGraduated: currentPlatform.totalGraduated ?? 0,
          });
        }
      } catch {
        // Best-effort — don't fail the response
      }
    }

    // T018: Broadcast new_token to platform channel
    if (wsService) {
      wsService.broadcast('platform', 'new_token', { ...tokenDoc, priceChange24hBps: 0 });
    }
  });
}

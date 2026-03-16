import type HyperExpress from '@btc-vision/hyper-express';
import { getTokensCollection } from '../db/models/Token.js';
import { getTradesCollection } from '../db/models/Trade.js';
import type { TokenListQuery, CreateTokenRequest, TimeframeKey, OHLCVCandle } from '../../../shared/types/api.js';
import type { TokenStatus } from '../../../shared/types/token.js';
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  GRADUATION_THRESHOLD_SATS,
  TOKEN_DECIMALS,
} from '../../../shared/constants/bonding-curve.js';
import type { Filter } from 'mongodb';
import type { TokenDocument } from '../../../shared/types/token.js';
import type { OptimisticStateService } from '../services/OptimisticStateService.js';
import { config } from '../config/env.js';

let _optimisticService: OptimisticStateService | null = null;

export function setOptimisticService(service: OptimisticStateService): void {
  _optimisticService = service;
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

// Clean up expired wallet rate limit entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [wallet, entry] of walletCreateCounts) {
    if (now > entry.resetAt) {
      walletCreateCounts.delete(wallet);
    }
  }
}, 600_000);

interface OnChainVerificationResult {
  valid: boolean;
  error?: string;
  deployBlock?: number;
}

/**
 * Verify the token contract on-chain:
 * 1. Transaction receipt exists (deployment confirmed)
 * 2. Contract responds to getReserves() (is a LaunchToken)
 * 3. Deployer address matches claimed creator
 * 4. On-chain config matches submitted config
 */
async function verifyTokenOnChain(
  contractAddress: string,
  creatorAddress: string,
  deployTxHash: string,
  clientConfig: { creatorAllocationBps: number; buyTaxBps: number; sellTaxBps: number },
): Promise<OnChainVerificationResult> {
  const { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } = await import('opnet');
  const { networks } = await import('@btc-vision/bitcoin');
  const network = config.network === 'mainnet' ? networks.bitcoin : networks.opnetTestnet;
  const provider = new JSONRpcProvider({ url: config.opnetRpcUrl, network });

  // 1. Verify deployment tx exists and extract deployer + block info
  const tx = await provider.getTransaction(deployTxHash);
  if (!tx) {
    return { valid: false, error: 'Deployment transaction not found on-chain. Wait for confirmation.' };
  }

  // 2. Verify deployer matches creator
  // IDeploymentTransaction extends ICommonTransaction which has `from` and `deployerAddress`
  const deploymentTx = tx as unknown as {
    from?: { p2tr: (n: unknown) => string; toHex: () => string } | string;
    deployerAddress?: { p2tr: (n: unknown) => string; toHex: () => string } | string;
    contractAddress?: string;
    blockNumber?: string | bigint;
  };

  try {
    // Prefer deployerAddress, fall back to from
    const rawDeployer = deploymentTx.deployerAddress ?? deploymentTx.from;
    if (rawDeployer) {
      let deployerAddress: string;
      if (typeof rawDeployer === 'string') {
        deployerAddress = rawDeployer;
      } else if (typeof rawDeployer === 'object' && 'p2tr' in rawDeployer && typeof rawDeployer.p2tr === 'function') {
        deployerAddress = rawDeployer.p2tr(network);
      } else {
        deployerAddress = String(rawDeployer);
      }

      if (deployerAddress !== creatorAddress) {
        return {
          valid: false,
          error: `Creator address mismatch: deployer is ${deployerAddress}, but ${creatorAddress} was submitted`,
        };
      }
    }
  } catch (err) {
    console.warn('[Tokens] Deployer verification failed:', err instanceof Error ? err.message : err);
    if (process.env.NODE_ENV === 'production') {
      return { valid: false, error: 'Failed to verify deployer address on-chain.' };
    }
  }

  // 3. Verify contract is a LaunchToken (getReserves + getConfig)
  const launchTokenAbi: import('opnet').BitcoinInterfaceAbi = [
    {
      name: 'getReserves',
      type: BitcoinAbiTypes.Function,
      constant: true,
      inputs: [],
      outputs: [
        { name: 'virtualBtc', type: ABIDataTypes.UINT256 },
        { name: 'virtualToken', type: ABIDataTypes.UINT256 },
        { name: 'realBtc', type: ABIDataTypes.UINT256 },
        { name: 'k', type: ABIDataTypes.UINT256 },
      ],
    },
    {
      name: 'getConfig',
      type: BitcoinAbiTypes.Function,
      constant: true,
      inputs: [],
      outputs: [
        { name: 'creatorBps', type: ABIDataTypes.UINT256 },
        { name: 'buyTax', type: ABIDataTypes.UINT256 },
        { name: 'sellTax', type: ABIDataTypes.UINT256 },
        { name: 'destination', type: ABIDataTypes.UINT256 },
        { name: 'threshold', type: ABIDataTypes.UINT256 },
      ],
    },
  ];

  let contract: ReturnType<typeof getContract>;
  try {
    contract = getContract(contractAddress, launchTokenAbi, provider, network);
  } catch {
    return { valid: false, error: 'Failed to connect to contract. Invalid contract address.' };
  }

  // 3a. Call getReserves — if this fails, it's not a LaunchToken
  try {
    const reserves = await (contract as unknown as {
      getReserves: () => Promise<{ properties: { virtualBtc: bigint; virtualToken: bigint; realBtc: bigint; k: bigint } }>;
    }).getReserves();

    if (!reserves?.properties) {
      return { valid: false, error: 'Contract is not a valid LaunchToken (getReserves returned no data).' };
    }
  } catch {
    return { valid: false, error: 'Contract is not a valid LaunchToken (getReserves call failed).' };
  }

  // 3b. Call getConfig and verify parameters match
  try {
    const onChainConfig = await (contract as unknown as {
      getConfig: () => Promise<{ properties: { creatorBps: bigint; buyTax: bigint; sellTax: bigint; destination: bigint; threshold: bigint } }>;
    }).getConfig();

    if (!onChainConfig?.properties) {
      return { valid: false, error: 'Failed to read contract config on-chain.' };
    }

    const { creatorBps, buyTax, sellTax } = onChainConfig.properties;

    if (Number(creatorBps) !== clientConfig.creatorAllocationBps) {
      return {
        valid: false,
        error: `Creator allocation mismatch: on-chain=${creatorBps}, submitted=${clientConfig.creatorAllocationBps}`,
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
    return { valid: false, error: 'Failed to verify contract config on-chain.' };
  }

  // Extract deploy block from tx (ITransactionBase has blockNumber?: string | bigint)
  let deployBlock = 0;
  if (deploymentTx.blockNumber) {
    deployBlock = typeof deploymentTx.blockNumber === 'bigint'
      ? Number(deploymentTx.blockNumber)
      : parseInt(String(deploymentTx.blockNumber), 10) || 0;
  }

  return { valid: true, deployBlock };
}

export function registerTokenRoutes(app: HyperExpress.Server): void {
  // GET /v1/tokens — list tokens with pagination, filter, sort, search
  app.get('/v1/tokens', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const status = String(req.query.status || 'all') as TokenListQuery['status'];
    const search = String(req.query.search || '');
    const sort = String(req.query.sort || 'newest') as TokenListQuery['sort'];
    const order = req.query.order === 'asc' ? 1 : -1;

    const tokens = getTokensCollection();
    const filter: Filter<TokenDocument> = {};

    if (status && status !== 'all') {
      filter.status = status as TokenStatus;
    }

    if (search) {
      filter.$text = { $search: search as string };
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

    res.json({
      tokens: results,
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
    if (_optimisticService && _optimisticService.hasPending(address)) {
      const optimistic = _optimisticService.getOptimisticPrice(address);
      const vToken = optimistic.reserves.virtualTokenSupply;
      const price = vToken > 0n ? optimistic.reserves.virtualBtcReserve / vToken : 0n;
      res.json({
        currentPriceSats: price.toString(),
        virtualBtcReserve: optimistic.reserves.virtualBtcReserve.toString(),
        virtualTokenSupply: optimistic.reserves.virtualTokenSupply.toString(),
        realBtcReserve: optimistic.reserves.realBtcReserve.toString(),
        isOptimistic: true,
        pendingBuySats: optimistic.pendingBuySats.toString(),
        pendingSellTokens: optimistic.pendingSellTokens.toString(),
        change24hBps: 0,
      });
      return;
    }

    res.json({
      currentPriceSats: token.currentPriceSats,
      virtualBtcReserve: token.virtualBtcReserve,
      virtualTokenSupply: token.virtualTokenSupply,
      realBtcReserve: token.realBtcReserve,
      isOptimistic: false,
      change24hBps: 0,
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
      { $match: { tokenAddress: address, status: 'confirmed' } },
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

    // Validate required fields exist and are strings
    if (
      typeof body.name !== 'string' || !body.name ||
      typeof body.symbol !== 'string' || !body.symbol ||
      typeof body.contractAddress !== 'string' || !body.contractAddress ||
      typeof body.creatorAddress !== 'string' || !body.creatorAddress
    ) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Missing required fields: name, symbol, contractAddress, creatorAddress (must be strings)',
        statusCode: 400,
      });
      return;
    }

    // Validate optional fields are correct types when present
    if (body.description !== undefined && typeof body.description !== 'string') {
      res.status(400).json({
        error: 'BadRequest',
        message: 'description must be a string',
        statusCode: 400,
      });
      return;
    }
    if (body.deployTxHash !== undefined && typeof body.deployTxHash !== 'string') {
      res.status(400).json({
        error: 'BadRequest',
        message: 'deployTxHash must be a string',
        statusCode: 400,
      });
      return;
    }

    // Validate field lengths
    if (body.name.length > 50) {
      res.status(400).json({ error: 'BadRequest', message: 'Name must be 50 characters or less', statusCode: 400 });
      return;
    }
    if (body.symbol.length > 10) {
      res.status(400).json({ error: 'BadRequest', message: 'Symbol must be 10 characters or less', statusCode: 400 });
      return;
    }
    if (body.description && body.description.length > 500) {
      res.status(400).json({ error: 'BadRequest', message: 'Description must be 500 characters or less', statusCode: 400 });
      return;
    }
    if (body.imageUrl && body.imageUrl.length > 2048) {
      res.status(400).json({ error: 'BadRequest', message: 'Image URL must be under 2048 characters', statusCode: 400 });
      return;
    }

    // Validate address formats
    const addressRegex = /^(bc1|bcrt1|tb1|op1|0x)[a-zA-Z0-9]{20,62}$/;
    if (!addressRegex.test(body.contractAddress)) {
      res.status(400).json({ error: 'BadRequest', message: 'Invalid contract address format', statusCode: 400 });
      return;
    }
    if (!addressRegex.test(body.creatorAddress)) {
      res.status(400).json({ error: 'BadRequest', message: 'Invalid creator address format', statusCode: 400 });
      return;
    }

    // Validate BPS values
    const bpsConfig = body.config || {};
    if (bpsConfig.creatorAllocationBps !== undefined && (bpsConfig.creatorAllocationBps < 0 || bpsConfig.creatorAllocationBps > 1000)) {
      res.status(400).json({ error: 'BadRequest', message: 'Creator allocation must be 0-1000 bps (0-10%)', statusCode: 400 });
      return;
    }
    if (bpsConfig.buyTaxBps !== undefined && (bpsConfig.buyTaxBps < 0 || bpsConfig.buyTaxBps > 300)) {
      res.status(400).json({ error: 'BadRequest', message: 'Buy tax must be 0-300 bps (0-3%)', statusCode: 400 });
      return;
    }
    if (bpsConfig.sellTaxBps !== undefined && (bpsConfig.sellTaxBps < 0 || bpsConfig.sellTaxBps > 500)) {
      res.status(400).json({ error: 'BadRequest', message: 'Sell tax must be 0-500 bps (0-5%)', statusCode: 400 });
      return;
    }

    // Validate deployTxHash is present (required for on-chain verification)
    if (!body.deployTxHash || typeof body.deployTxHash !== 'string' || body.deployTxHash.length < 64) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'deployTxHash is required and must be a valid transaction hash (64+ hex chars)',
        statusCode: 400,
      });
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
          creatorAllocationBps: bpsConfig.creatorAllocationBps ?? 0,
          buyTaxBps: bpsConfig.buyTaxBps ?? 0,
          sellTaxBps: bpsConfig.sellTaxBps ?? 0,
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
    // Price per whole token (not per smallest unit): scale by 10^DECIMALS
    const decimalsFactor = 10n ** BigInt(TOKEN_DECIMALS);
    const initialPrice = ((INITIAL_VIRTUAL_BTC_SATS * decimalsFactor) / INITIAL_VIRTUAL_TOKEN_SUPPLY).toString();

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
  });
}

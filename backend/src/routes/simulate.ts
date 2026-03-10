import type HyperExpress from '@btc-vision/hyper-express';
import { getTokensCollection } from '../db/models/Token.js';
import { BondingCurveSimulator } from '../services/BondingCurveSimulator.js';
import type { SimulateBuyRequest, SimulateSellRequest } from '../../../shared/types/api.js';
import { MIN_TRADE_SATS } from '../../../shared/constants/bonding-curve.js';

const simulator = new BondingCurveSimulator();

export function registerSimulateRoutes(app: HyperExpress.Server): void {
  // POST /v1/simulate/buy
  app.post('/v1/simulate/buy', async (req, res) => {
    let body: SimulateBuyRequest;
    try {
      body = await req.json() as SimulateBuyRequest;
    } catch {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid JSON body',
        statusCode: 400,
      });
      return;
    }

    if (!body.tokenAddress || !body.btcAmountSats) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Missing required fields: tokenAddress, btcAmountSats',
        statusCode: 400,
      });
      return;
    }

    let btcAmount: bigint;
    try {
      btcAmount = BigInt(body.btcAmountSats);
    } catch {
      res.status(400).json({
        error: 'BadRequest',
        message: 'btcAmountSats must be a non-negative integer string',
        statusCode: 400,
      });
      return;
    }
    if (btcAmount < 0n) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'btcAmountSats must be non-negative',
        statusCode: 400,
      });
      return;
    }
    if (btcAmount < MIN_TRADE_SATS) {
      res.status(400).json({
        error: 'BadRequest',
        message: `Minimum trade amount is ${MIN_TRADE_SATS} sats`,
        statusCode: 400,
      });
      return;
    }

    // Look up token reserves
    const tokens = getTokensCollection();
    const token = await tokens.findOne({ _id: body.tokenAddress });
    if (!token) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Token not found',
        statusCode: 404,
      });
      return;
    }

    if (token.status === 'graduated') {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Token has graduated',
        statusCode: 400,
      });
      return;
    }

    const reserves = {
      virtualBtcReserve: BigInt(token.virtualBtcReserve),
      virtualTokenSupply: BigInt(token.virtualTokenSupply),
      kConstant: BigInt(token.kConstant),
      realBtcReserve: BigInt(token.realBtcReserve),
    };

    try {
      const result = simulator.simulateBuy(reserves, btcAmount, BigInt(token.config.buyTaxBps));

      res.json({
        tokensOut: result.tokensOut.toString(),
        fees: {
          platform: result.fees.platform.toString(),
          creator: result.fees.creator.toString(),
          minter: result.fees.minter.toString(),
          flywheel: result.fees.flywheel.toString(),
          total: result.fees.total.toString(),
        },
        priceImpactBps: result.priceImpactBps,
        newPriceSats: result.newPriceSats.toString(),
        effectivePriceSats: result.effectivePriceSats.toString(),
      });
    } catch (err) {
      res.status(400).json({
        error: 'SimulationError',
        message: err instanceof Error ? err.message : 'Simulation failed',
        statusCode: 400,
      });
    }
  });

  // POST /v1/simulate/sell
  app.post('/v1/simulate/sell', async (req, res) => {
    let body: SimulateSellRequest;
    try {
      body = await req.json() as SimulateSellRequest;
    } catch {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Invalid JSON body',
        statusCode: 400,
      });
      return;
    }

    if (!body.tokenAddress || !body.tokenAmount) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Missing required fields: tokenAddress, tokenAmount',
        statusCode: 400,
      });
      return;
    }

    // Look up token reserves
    const tokens = getTokensCollection();
    const token = await tokens.findOne({ _id: body.tokenAddress });
    if (!token) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Token not found',
        statusCode: 404,
      });
      return;
    }

    if (token.status === 'graduated') {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Token has graduated',
        statusCode: 400,
      });
      return;
    }

    const reserves = {
      virtualBtcReserve: BigInt(token.virtualBtcReserve),
      virtualTokenSupply: BigInt(token.virtualTokenSupply),
      kConstant: BigInt(token.kConstant),
      realBtcReserve: BigInt(token.realBtcReserve),
    };

    try {
      let tokenAmount: bigint;
      try {
        tokenAmount = BigInt(body.tokenAmount);
      } catch {
        res.status(400).json({
          error: 'BadRequest',
          message: 'tokenAmount must be a non-negative integer string',
          statusCode: 400,
        });
        return;
      }
      if (tokenAmount <= 0n) {
        res.status(400).json({
          error: 'BadRequest',
          message: 'tokenAmount must be positive',
          statusCode: 400,
        });
        return;
      }
      const result = simulator.simulateSell(reserves, tokenAmount, BigInt(token.config.sellTaxBps));

      res.json({
        btcOut: result.btcOut.toString(),
        fees: {
          platform: result.fees.platform.toString(),
          creator: result.fees.creator.toString(),
          minter: result.fees.minter.toString(),
          flywheel: result.fees.flywheel.toString(),
          total: result.fees.total.toString(),
        },
        priceImpactBps: result.priceImpactBps,
        newPriceSats: result.newPriceSats.toString(),
        effectivePriceSats: result.effectivePriceSats.toString(),
      });
    } catch (err) {
      res.status(400).json({
        error: 'SimulationError',
        message: err instanceof Error ? err.message : 'Simulation failed',
        statusCode: 400,
      });
    }
  });
}

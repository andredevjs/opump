/**
 * Shared token creation handler — used by both tokens-create.mts and tokens-list.mts.
 */

import { json, error } from "./response.mts";
import { getToken, saveToken, TOKEN_HOLDERS_SET, TOKEN_HOLDER_BALANCES } from "./redis-queries.mts";
import { getRedis } from "./redis.mts";
import { checkCreateRateLimit } from "./rate-limit.mts";
import { verifyTokenOnChain } from "./on-chain-verify.mts";
import type { CreateTokenRequest, TokenDocument } from "./constants.mts";
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  GRADUATION_THRESHOLD_SATS,
  PRICE_PRECISION,
  PRICE_DISPLAY_DIVISOR,
} from "./constants.mts";

export async function handleCreateToken(req: Request): Promise<Response> {
  let body: CreateTokenRequest;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  // Validate required fields
  if (
    typeof body.name !== "string" || !body.name ||
    typeof body.symbol !== "string" || !body.symbol ||
    typeof body.contractAddress !== "string" || !body.contractAddress ||
    typeof body.creatorAddress !== "string" || !body.creatorAddress
  ) {
    return error("Missing required fields: name, symbol, contractAddress, creatorAddress (must be strings)", 400);
  }

  // Validate optional fields
  if (body.description !== undefined && typeof body.description !== "string") {
    return error("description must be a string", 400);
  }
  if (body.deployTxHash !== undefined && typeof body.deployTxHash !== "string") {
    return error("deployTxHash must be a string", 400);
  }

  // Validate socials object
  if (body.socials) {
    if (typeof body.socials !== 'object' || Array.isArray(body.socials)) {
      return error('socials must be an object', 400);
    }
    for (const [key, value] of Object.entries(body.socials)) {
      if (typeof value !== 'string' || value.length > 256) {
        return error(`Social link "${key}" must be a string under 256 characters`, 400);
      }
    }
  }

  // Validate field lengths
  if (body.name.length > 50) {
    return error("Name must be 50 characters or less", 400);
  }
  if (body.symbol.length > 10) {
    return error("Symbol must be 10 characters or less", 400);
  }
  if (body.description && body.description.length > 500) {
    return error("Description must be 500 characters or less", 400);
  }
  if (body.imageUrl && body.imageUrl.length > 2048) {
    return error("Image URL must be under 2048 characters", 400);
  }
  if (body.imageUrl && !body.imageUrl.startsWith('https://') && !body.imageUrl.startsWith('http://')) {
    return error('Image URL must use https:// or http:// protocol', 400);
  }

  // Validate address formats — bech32 data part is lowercase-only, excludes b/i/o/1; 0x addresses are 40-64 hex chars
  const addressRegex = /^(?:(?:bc1|bcrt1|tb1|op1|opt1)[ac-hj-np-z02-9]{20,64}|0x[a-fA-F0-9]{40,64})$/;
  if (!addressRegex.test(body.contractAddress)) {
    return error("Invalid contract address format", 400);
  }
  if (!addressRegex.test(body.creatorAddress)) {
    return error("Invalid creator address format", 400);
  }

  // Validate BPS values
  const bpsConfig = body.config || {} as CreateTokenRequest["config"];
  if (bpsConfig.creatorAllocationBps !== undefined && (bpsConfig.creatorAllocationBps < 0 || bpsConfig.creatorAllocationBps > 7000)) {
    return error("Creator allocation must be 0-7000 bps (0-70%)", 400);
  }
  if (bpsConfig.airdropBps !== undefined && (bpsConfig.airdropBps < 0 || bpsConfig.airdropBps > 7000)) {
    return error("Airdrop must be 0-7000 bps (0-70%)", 400);
  }
  const combinedAlloc = (bpsConfig.creatorAllocationBps ?? 0) + (bpsConfig.airdropBps ?? 0);
  if (combinedAlloc > 7000) {
    return error("Combined allocation (creator + airdrop) exceeds 70%", 400);
  }
  if (bpsConfig.buyTaxBps !== undefined && (bpsConfig.buyTaxBps < 0 || bpsConfig.buyTaxBps > 300)) {
    return error("Buy tax must be 0-300 bps (0-3%)", 400);
  }
  if (bpsConfig.sellTaxBps !== undefined && (bpsConfig.sellTaxBps < 0 || bpsConfig.sellTaxBps > 500)) {
    return error("Sell tax must be 0-500 bps (0-5%)", 400);
  }

  // Validate deployTxHash
  if (!body.deployTxHash || typeof body.deployTxHash !== "string" || body.deployTxHash.length < 64) {
    return error("deployTxHash is required and must be a valid transaction hash (64+ hex chars)", 400);
  }

  // On-chain verification — best-effort, non-blocking.
  // The user already deployed the contract and registered with the factory
  // (which validated params on-chain). The RPC may not have indexed the TX
  // yet (mempool-first), so we save the token regardless and let the indexer
  // confirm it when the block lands.
  let verifiedDeployBlock = 0;

  try {
    const verification = await verifyTokenOnChain(
      body.contractAddress,
      body.creatorAddress,
      body.deployTxHash,
      {
        creatorAllocationBps: bpsConfig.creatorAllocationBps ?? 0,
        airdropBps: bpsConfig.airdropBps ?? 0,
        buyTaxBps: bpsConfig.buyTaxBps ?? 0,
        sellTaxBps: bpsConfig.sellTaxBps ?? 0,
      },
    );

    if (verification.valid) {
      verifiedDeployBlock = verification.deployBlock ?? 0;
    } else if (verification.error && !verification.error.includes("not found")) {
      // Permanent validation failure (e.g. config mismatch) — reject immediately
      return error(verification.error, 400);
    } else {
      // TX not indexed yet — save anyway, indexer will verify later
      console.info("[Tokens] On-chain verification deferred (TX not indexed yet):", verification.error);
    }
  } catch (verifyErr) {
    // RPC unreachable or threw — save anyway, indexer will verify later
    console.warn("[Tokens] On-chain verification unavailable, saving optimistically:", verifyErr instanceof Error ? verifyErr.message : verifyErr);
  }

  // Rate-limit token creation per wallet (3 per hour)
  // Placed after on-chain verification so invalid requests don't consume rate limit
  const allowed = await checkCreateRateLimit(body.creatorAddress);
  if (!allowed) {
    return error("Token creation rate limit exceeded for this wallet. Max 3 per hour.", 429, "TooManyRequests");
  }

  // Check for duplicate
  const existing = await getToken(body.contractAddress);
  if (existing) {
    return error("Token already registered", 409, "Conflict");
  }

  const now = new Date();

  // Calculate curve supply: reduce by off-curve allocation (creator + airdrop)
  const totalOffCurveBps = BigInt((bpsConfig.creatorAllocationBps ?? 0) + (bpsConfig.airdropBps ?? 0));
  const curveBps = 10_000n - totalOffCurveBps;
  const curveSupply = (INITIAL_VIRTUAL_TOKEN_SUPPLY * curveBps) / 10_000n;
  const kConstant = INITIAL_VIRTUAL_BTC_SATS * curveSupply;

  const initialPriceScaled = curveSupply > 0n
    ? (INITIAL_VIRTUAL_BTC_SATS * PRICE_PRECISION) / curveSupply
    : 0n;
  const initialPrice = (Number(initialPriceScaled) / PRICE_DISPLAY_DIVISOR).toString();

  const tokenDoc: TokenDocument = {
    _id: body.contractAddress,
    name: body.name,
    symbol: body.symbol,
    description: body.description || "",
    imageUrl: body.imageUrl || "",
    socials: body.socials || {},
    creatorAddress: body.creatorAddress,
    contractAddress: body.contractAddress,
    virtualBtcReserve: INITIAL_VIRTUAL_BTC_SATS.toString(),
    virtualTokenSupply: curveSupply.toString(),
    kConstant: kConstant.toString(),
    realBtcReserve: "0",
    config: {
      creatorAllocationBps: body.config?.creatorAllocationBps ?? 0,
      airdropBps: body.config?.airdropBps ?? 0,
      buyTaxBps: body.config?.buyTaxBps ?? 0,
      sellTaxBps: body.config?.sellTaxBps ?? 0,
      flywheelDestination: body.config?.flywheelDestination || "burn",
      graduationThreshold: GRADUATION_THRESHOLD_SATS.toString(),
    },
    status: "active",
    currentPriceSats: initialPrice,
    volume24h: "0",
    volumeTotal: "0",
    marketCapSats: "0",
    tradeCount: 0,
    holderCount: 0,
    deployBlock: verifiedDeployBlock,
    deployTxHash: body.deployTxHash,
    createdAt: now,
    updatedAt: now,
  };

  await saveToken(tokenDoc);

  // Seed creator + airdrop allocation balance if configured
  const totalMintedBps = tokenDoc.config.creatorAllocationBps + (tokenDoc.config.airdropBps ?? 0);
  if (totalMintedBps > 0) {
    const creatorTokens = (INITIAL_VIRTUAL_TOKEN_SUPPLY * BigInt(totalMintedBps)) / 10000n;
    const redis = getRedis();
    const pipe = redis.pipeline();
    pipe.zadd(TOKEN_HOLDER_BALANCES(tokenDoc.contractAddress), {
      score: Number(creatorTokens),
      member: tokenDoc.creatorAddress,
    });
    pipe.sadd(TOKEN_HOLDERS_SET(tokenDoc.contractAddress), tokenDoc.creatorAddress);
    pipe.hset(`op:token:${tokenDoc.contractAddress}`, { holderCount: "1" });
    await pipe.exec();
  }

  return json(tokenDoc, 201);
}

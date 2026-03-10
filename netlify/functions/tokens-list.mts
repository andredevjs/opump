import type { Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { listTokens, getToken, saveToken } from "./_shared/redis-queries.mts";
import { checkCreateRateLimit } from "./_shared/rate-limit.mts";
import { verifyTokenOnChain } from "./_shared/on-chain-verify.mts";
import type { CreateTokenRequest } from "../../shared/types/api.js";
import type { TokenDocument } from "../../shared/types/token.js";
import {
  INITIAL_VIRTUAL_BTC_SATS,
  INITIAL_VIRTUAL_TOKEN_SUPPLY,
  K_CONSTANT,
  GRADUATION_THRESHOLD_SATS,
  TOKEN_DECIMALS,
} from "../../shared/constants/bonding-curve.js";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Route POST to token creation
  if (req.method === "POST") {
    return handleCreate(req);
  }

  // GET — list tokens
  return handleList(req);
};

async function handleList(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
  const status = url.searchParams.get("status") || "all";
  const search = url.searchParams.get("search") || "";
  const sort = url.searchParams.get("sort") || "newest";
  const order = url.searchParams.get("order") === "asc" ? "asc" as const : "desc" as const;

  try {
    const result = await listTokens({ status, sort, order, page, limit, search });

    return json({
      tokens: result.tokens,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
}

async function handleCreate(req: Request): Promise<Response> {
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

  if (body.description !== undefined && typeof body.description !== "string") {
    return error("description must be a string", 400);
  }
  if (body.deployTxHash !== undefined && typeof body.deployTxHash !== "string") {
    return error("deployTxHash must be a string", 400);
  }

  if (body.name.length > 50) return error("Name must be 50 characters or less", 400);
  if (body.symbol.length > 10) return error("Symbol must be 10 characters or less", 400);
  if (body.description && body.description.length > 500) return error("Description must be 500 characters or less", 400);
  if (body.imageUrl && body.imageUrl.length > 2048) return error("Image URL must be under 2048 characters", 400);

  const addressRegex = /^(bc1|bcrt1|tb1|op1|0x)[a-zA-Z0-9]{20,62}$/;
  if (!addressRegex.test(body.contractAddress)) return error("Invalid contract address format", 400);
  if (!addressRegex.test(body.creatorAddress)) return error("Invalid creator address format", 400);

  const bpsConfig = body.config || {} as CreateTokenRequest["config"];
  if (bpsConfig.creatorAllocationBps !== undefined && (bpsConfig.creatorAllocationBps < 0 || bpsConfig.creatorAllocationBps > 1000)) {
    return error("Creator allocation must be 0-1000 bps (0-10%)", 400);
  }
  if (bpsConfig.buyTaxBps !== undefined && (bpsConfig.buyTaxBps < 0 || bpsConfig.buyTaxBps > 300)) {
    return error("Buy tax must be 0-300 bps (0-3%)", 400);
  }
  if (bpsConfig.sellTaxBps !== undefined && (bpsConfig.sellTaxBps < 0 || bpsConfig.sellTaxBps > 500)) {
    return error("Sell tax must be 0-500 bps (0-5%)", 400);
  }

  if (!body.deployTxHash || typeof body.deployTxHash !== "string" || body.deployTxHash.length < 64) {
    return error("deployTxHash is required and must be a valid transaction hash (64+ hex chars)", 400);
  }

  const allowed = await checkCreateRateLimit(body.creatorAddress);
  if (!allowed) {
    return error("Token creation rate limit exceeded for this wallet. Max 3 per hour.", 429, "TooManyRequests");
  }

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
      return error(verification.error || "On-chain verification failed.", 400);
    }
    verifiedDeployBlock = verification.deployBlock ?? 0;
  } catch (verifyErr) {
    console.warn("[Tokens] On-chain verification failed:", verifyErr instanceof Error ? verifyErr.message : verifyErr);
    return error("On-chain verification unavailable. Try again later.", 503, "ServiceUnavailable");
  }

  const existing = await getToken(body.contractAddress);
  if (existing) {
    return error("Token already registered", 409, "Conflict");
  }

  const now = new Date();
  const decimalsFactor = 10n ** BigInt(TOKEN_DECIMALS);
  const initialPrice = ((INITIAL_VIRTUAL_BTC_SATS * decimalsFactor) / INITIAL_VIRTUAL_TOKEN_SUPPLY).toString();

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
    virtualTokenSupply: INITIAL_VIRTUAL_TOKEN_SUPPLY.toString(),
    kConstant: K_CONSTANT.toString(),
    realBtcReserve: "0",
    config: {
      creatorAllocationBps: body.config?.creatorAllocationBps || 0,
      buyTaxBps: body.config?.buyTaxBps || 0,
      sellTaxBps: body.config?.sellTaxBps || 0,
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
  return json(tokenDoc, 201);
}

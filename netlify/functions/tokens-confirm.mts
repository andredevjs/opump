import type { Config, Context } from "@netlify/functions";
import { json, error, corsHeaders } from "./_shared/response.mts";
import { getToken, updateToken } from "./_shared/redis-queries.mts";
import { verifyTokenOnChain } from "./_shared/on-chain-verify.mts";

export default async (req: Request, context: Context) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const address = context.params.address;
  if (!address) {
    return error("Missing address parameter", 400);
  }

  try {
    const token = await getToken(address);
    if (!token) {
      return error("Token not found", 404, "NotFound");
    }

    // Already confirmed — return immediately
    if (token.deployBlock && token.deployBlock > 0) {
      return json({ deployBlock: token.deployBlock });
    }

    if (!token.deployTxHash) {
      return error("Token has no deploy transaction hash", 400);
    }

    const verification = await verifyTokenOnChain(
      token.contractAddress,
      token.creatorAddress,
      token.deployTxHash,
      {
        creatorAllocationBps: token.config.creatorAllocationBps,
        airdropBps: token.config.airdropBps ?? 0,
        buyTaxBps: token.config.buyTaxBps ?? 0,
        sellTaxBps: token.config.sellTaxBps ?? 0,
      },
    );

    if (verification.valid && verification.deployBlock && verification.deployBlock > 0) {
      await updateToken(address, { deployBlock: verification.deployBlock });
      return json({ deployBlock: verification.deployBlock });
    }

    // TX not yet in a block — still pending
    return json({ deployBlock: 0 });
  } catch (err) {
    return error(err instanceof Error ? err.message : "Internal error", 500, "InternalError");
  }
};

export const config: Config = {
  path: "/api/v1/tokens/:address/confirm",
  method: ["POST", "OPTIONS"],
};

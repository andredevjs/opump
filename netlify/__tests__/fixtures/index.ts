/**
 * Test fixtures — factory functions and shared constants.
 */
import type { TokenDocument, TradeDocument, CreateTokenRequest } from '../../functions/_shared/constants.mts';

// bech32 chars: [ac-hj-np-z02-9] — excludes b,i,o,1
export const VALID_TOKEN_ADDRESS = 'bc1ptestaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
export const VALID_CREATOR_ADDRESS = 'bc1ptestcccccccccccccccccccccccccccccccccccc';
export const VALID_TRADER_ADDRESS = 'bc1ptestdddddddddddddddddddddddddddddddddd';
export const VALID_TX_HASH = 'a'.repeat(64);

export function makeToken(overrides?: Partial<TokenDocument>): TokenDocument {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    _id: VALID_TOKEN_ADDRESS,
    name: 'TestToken',
    symbol: 'TEST',
    description: 'A test token',
    imageUrl: 'https://example.com/test.png',
    socials: { website: 'https://example.com' },
    creatorAddress: VALID_CREATOR_ADDRESS,
    contractAddress: VALID_TOKEN_ADDRESS,
    virtualBtcReserve: '767000',
    virtualTokenSupply: '100000000000000000',
    kConstant: '76700000000000000000000',
    realBtcReserve: '0',
    config: {
      creatorAllocationBps: 0,
      buyTaxBps: 0,
      sellTaxBps: 0,
      flywheelDestination: 'burn',
      graduationThreshold: '69000000',
    },
    status: 'active',
    currentPriceSats: '7670',
    volume24h: '0',
    volumeTotal: '0',
    marketCapSats: '0',
    tradeCount: 0,
    holderCount: 0,
    deployBlock: 100,
    deployTxHash: VALID_TX_HASH,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function makeTrade(overrides?: Partial<TradeDocument>): TradeDocument {
  return {
    _id: 'b'.repeat(64),
    tokenAddress: VALID_TOKEN_ADDRESS,
    type: 'buy',
    traderAddress: VALID_TRADER_ADDRESS,
    btcAmount: '100000',
    tokenAmount: '11403990276138280',
    pricePerToken: '8770',
    fees: { platform: '1000', creator: '250', flywheel: '0' },
    priceImpactBps: 1287,
    status: 'pending',
    createdAt: new Date('2026-01-01T00:01:00Z'),
    ...overrides,
  };
}

export function makeCreateTokenRequest(overrides?: Partial<CreateTokenRequest>): CreateTokenRequest {
  return {
    name: 'TestToken',
    symbol: 'TEST',
    description: 'A test token',
    imageUrl: 'https://example.com/test.png',
    socials: { website: 'https://example.com' },
    creatorAddress: VALID_CREATOR_ADDRESS,
    contractAddress: VALID_TOKEN_ADDRESS,
    config: {
      creatorAllocationBps: 0,
      buyTaxBps: 0,
      sellTaxBps: 0,
      flywheelDestination: 'burn',
    },
    deployTxHash: VALID_TX_HASH,
    ...overrides,
  };
}

/** Assert CORS headers are present on a Response */
export function expectCorsHeaders(res: Response): void {
  const headers = res.headers;
  if (!headers.get('access-control-allow-origin')) {
    throw new Error('Missing Access-Control-Allow-Origin header');
  }
}

/** Assert error response shape { error, message, statusCode } */
export async function expectErrorShape(res: Response, expectedStatus: number): Promise<Record<string, unknown>> {
  const body = await res.json() as Record<string, unknown>;
  if (res.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, got ${res.status}`);
  }
  if (!body.error || !body.message || body.statusCode !== expectedStatus) {
    throw new Error(`Invalid error shape: ${JSON.stringify(body)}`);
  }
  return body;
}

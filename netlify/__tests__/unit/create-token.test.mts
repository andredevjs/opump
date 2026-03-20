import { describe, it, expect, beforeEach } from 'vitest';
import { resetMockRedis } from '../mocks/redis-mock.js';
import { resetOpnetMock, opnetMockState } from '../mocks/opnet-mock.js';
import { handleCreateToken } from '../../functions/_shared/create-token.mts';
import { makeCreateTokenRequest, VALID_TOKEN_ADDRESS, VALID_CREATOR_ADDRESS } from '../fixtures/index.js';

// Bech32-valid addresses (data part uses only [ac-hj-np-z02-9], no b/i/o/1)
const TOKEN_ADDR = 'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqa';
const CREATOR_ADDR = 'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2';
const DEPLOY_TX = 'a'.repeat(64);

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/v1/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Build a valid CreateTokenRequest using bech32-valid addresses. */
function validRequest(overrides?: Record<string, unknown>) {
  return makeCreateTokenRequest({
    contractAddress: TOKEN_ADDR,
    creatorAddress: CREATOR_ADDR,
    deployTxHash: DEPLOY_TX,
    ...overrides,
  });
}

describe('handleCreateToken', () => {
  beforeEach(() => {
    resetMockRedis();
    resetOpnetMock();
    // Align mock deployer address with the test creator address
    opnetMockState.transaction = {
      from: CREATOR_ADDR,
      deployerAddress: CREATOR_ADDR,
      blockNumber: 100n,
    };
  });

  // 1. Valid request
  it('returns 201 with correct fields for a valid request', async () => {
    const res = await handleCreateToken(makeRequest(validRequest()));
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.name).toBe('TestToken');
    expect(body.symbol).toBe('TEST');
    expect(body.virtualBtcReserve).toBe('767000');
    expect(body.status).toBe('active');
  });

  // 2. Missing name
  it('returns 400 when name is missing', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ name: '' })));
    expect(res.status).toBe(400);
  });

  // 3. Missing symbol
  it('returns 400 when symbol is missing', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ symbol: '' })));
    expect(res.status).toBe(400);
  });

  // 4. Missing contractAddress
  it('returns 400 when contractAddress is missing', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ contractAddress: '' })));
    expect(res.status).toBe(400);
  });

  // 5. Missing creatorAddress
  it('returns 400 when creatorAddress is missing', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ creatorAddress: '' })));
    expect(res.status).toBe(400);
  });

  // 6. Name too long
  it('returns 400 when name exceeds 50 characters', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ name: 'a'.repeat(51) })));
    expect(res.status).toBe(400);
  });

  // 7. Symbol too long
  it('returns 400 when symbol exceeds 10 characters', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ symbol: 'A'.repeat(11) })));
    expect(res.status).toBe(400);
  });

  // 8. Description too long
  it('returns 400 when description exceeds 500 characters', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ description: 'x'.repeat(501) })));
    expect(res.status).toBe(400);
  });

  // 9. Invalid address format
  it('returns 400 for invalid address format', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ contractAddress: 'invalid' })));
    expect(res.status).toBe(400);
  });

  // 10. Missing deployTxHash
  it('returns 400 when deployTxHash is missing', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ deployTxHash: '' })));
    expect(res.status).toBe(400);
  });

  // 11. deployTxHash too short
  it('returns 400 when deployTxHash is shorter than 64 characters', async () => {
    const res = await handleCreateToken(makeRequest(validRequest({ deployTxHash: 'abc123' })));
    expect(res.status).toBe(400);
  });

  // 12. Duplicate contractAddress
  it('returns 409 when the same contractAddress is registered twice', async () => {
    const first = await handleCreateToken(makeRequest(validRequest()));
    expect(first.status).toBe(201);

    const second = await handleCreateToken(makeRequest(validRequest()));
    expect(second.status).toBe(409);
  });

  // 13. On-chain verification fails
  it('returns 400 when on-chain verification fails (transaction not found)', async () => {
    opnetMockState.transaction = null;

    const res = await handleCreateToken(makeRequest(validRequest()));
    expect(res.status).toBe(400);
  });

  // 14. Rate limited after 3 creations
  it('returns 429 on the 4th token creation (rate limit)', async () => {
    // Each request needs a unique contractAddress that passes bech32 validation
    const addresses = [
      'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqa',
      'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqc',
      'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqd',
      'bc1pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq2',
    ];

    for (let i = 0; i < 3; i++) {
      const res = await handleCreateToken(
        makeRequest(validRequest({ contractAddress: addresses[i] })),
      );
      expect(res.status).toBe(201);
    }

    const res = await handleCreateToken(
      makeRequest(validRequest({ contractAddress: addresses[3] })),
    );
    expect(res.status).toBe(429);
  });

  // 15. creatorAllocationBps > 0 succeeds
  it('returns 201 when creatorAllocationBps is set (e.g. 500)', async () => {
    // Align mock on-chain config with the submitted BPS values
    opnetMockState.config.properties.creatorBps = 500n;

    const res = await handleCreateToken(
      makeRequest(
        validRequest({
          config: {
            creatorAllocationBps: 500,
            buyTaxBps: 0,
            sellTaxBps: 0,
            flywheelDestination: 'burn',
          },
        }),
      ),
    );
    expect(res.status).toBe(201);
  });
});

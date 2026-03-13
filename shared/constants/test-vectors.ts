/**
 * Bonding curve test vectors for cross-layer consistency verification.
 * Contract, backend BondingCurveSimulator, and frontend bonding-curve.ts
 * must all produce identical outputs for these inputs.
 *
 * NOTE: These vectors test raw constant-product AMM math only (no fees).
 * Fee-inclusive trade simulation is tested separately in BondingCurveSimulator.test.ts
 * and cross-layer-consistency.test.ts.
 */

export interface TestVector {
  name: string;
  input: {
    virtualBtcReserve: bigint;
    virtualTokenSupply: bigint;
    kConstant: bigint;
    amount: bigint; // btcAmount for buy, tokenAmount for sell
  };
  expectedBuy: {
    tokensOut: bigint;
    newVirtualBtcReserve: bigint;
    newVirtualTokenSupply: bigint;
  };
  expectedSell: {
    btcOut: bigint;
    newVirtualBtcReserve: bigint;
    newVirtualTokenSupply: bigint;
  };
}

const INITIAL_BTC = 767_000n; // 0.00767 BTC — matches shared constants
const INITIAL_TOKEN = 100_000_000_000_000_000n;
const K = INITIAL_BTC * INITIAL_TOKEN; // 76_700_000_000_000_000_000_000n

export const TEST_VECTORS: TestVector[] = [
  {
    name: 'Minimum buy (10,000 sats)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 10_000n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 10_000n),
      newVirtualBtcReserve: INITIAL_BTC + 10_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 10_000n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 10_000n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 10_000n),
      newVirtualTokenSupply: INITIAL_TOKEN + 10_000n,
    },
  },
  {
    name: 'Small buy (100,000 sats = 0.001 BTC)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 100_000n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 100_000n),
      newVirtualBtcReserve: INITIAL_BTC + 100_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 100_000n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 100_000n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 100_000n),
      newVirtualTokenSupply: INITIAL_TOKEN + 100_000n,
    },
  },
  {
    name: 'Medium buy (1,000,000 sats = 0.01 BTC)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 1_000_000n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 1_000_000n),
      newVirtualBtcReserve: INITIAL_BTC + 1_000_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 1_000_000n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 1_000_000n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 1_000_000n),
      newVirtualTokenSupply: INITIAL_TOKEN + 1_000_000n,
    },
  },
  {
    name: 'Large buy (10,000,000 sats = 0.1 BTC)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 10_000_000n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 10_000_000n),
      newVirtualBtcReserve: INITIAL_BTC + 10_000_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 10_000_000n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 10_000_000n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 10_000_000n),
      newVirtualTokenSupply: INITIAL_TOKEN + 10_000_000n,
    },
  },
  {
    name: 'Very large buy (100,000,000 sats = 1 BTC)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 100_000_000n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 100_000_000n),
      newVirtualBtcReserve: INITIAL_BTC + 100_000_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 100_000_000n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 100_000_000n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 100_000_000n),
      newVirtualTokenSupply: INITIAL_TOKEN + 100_000_000n,
    },
  },
  {
    name: 'Buy after price has moved up (reserves shifted)',
    input: {
      virtualBtcReserve: INITIAL_BTC + 100_000n,
      virtualTokenSupply: K / (INITIAL_BTC + 100_000n),
      kConstant: K,
      amount: 500_000n,
    },
    expectedBuy: {
      tokensOut: K / (INITIAL_BTC + 100_000n) - K / (INITIAL_BTC + 100_000n + 500_000n),
      newVirtualBtcReserve: INITIAL_BTC + 100_000n + 500_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 100_000n + 500_000n),
    },
    expectedSell: {
      btcOut: (INITIAL_BTC + 100_000n) - K / (K / (INITIAL_BTC + 100_000n) + 500_000n),
      newVirtualBtcReserve: K / (K / (INITIAL_BTC + 100_000n) + 500_000n),
      newVirtualTokenSupply: K / (INITIAL_BTC + 100_000n) + 500_000n,
    },
  },
  {
    name: 'Near-graduation buy (real BTC close to threshold)',
    input: {
      virtualBtcReserve: INITIAL_BTC + 6_800_000n,
      virtualTokenSupply: K / (INITIAL_BTC + 6_800_000n),
      kConstant: K,
      amount: 200_000n,
    },
    expectedBuy: {
      tokensOut: K / (INITIAL_BTC + 6_800_000n) - K / (INITIAL_BTC + 6_800_000n + 200_000n),
      newVirtualBtcReserve: INITIAL_BTC + 6_800_000n + 200_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 6_800_000n + 200_000n),
    },
    expectedSell: {
      btcOut: (INITIAL_BTC + 6_800_000n) - K / (K / (INITIAL_BTC + 6_800_000n) + 200_000n),
      newVirtualBtcReserve: K / (K / (INITIAL_BTC + 6_800_000n) + 200_000n),
      newVirtualTokenSupply: K / (INITIAL_BTC + 6_800_000n) + 200_000n,
    },
  },
  {
    name: 'Sequential buys: second buy at new reserves',
    input: {
      virtualBtcReserve: INITIAL_BTC + 1_000_000n,
      virtualTokenSupply: K / (INITIAL_BTC + 1_000_000n),
      kConstant: K,
      amount: 50_000n,
    },
    expectedBuy: {
      tokensOut: K / (INITIAL_BTC + 1_000_000n) - K / (INITIAL_BTC + 1_000_000n + 50_000n),
      newVirtualBtcReserve: INITIAL_BTC + 1_000_000n + 50_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 1_000_000n + 50_000n),
    },
    expectedSell: {
      btcOut: (INITIAL_BTC + 1_000_000n) - K / (K / (INITIAL_BTC + 1_000_000n) + 50_000n),
      newVirtualBtcReserve: K / (K / (INITIAL_BTC + 1_000_000n) + 50_000n),
      newVirtualTokenSupply: K / (INITIAL_BTC + 1_000_000n) + 50_000n,
    },
  },
  {
    name: 'Exact 1 sat buy (edge case)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 1n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 1n),
      newVirtualBtcReserve: INITIAL_BTC + 1n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 1n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 1n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 1n),
      newVirtualTokenSupply: INITIAL_TOKEN + 1n,
    },
  },
  {
    name: 'Large whale buy (10 BTC)',
    input: {
      virtualBtcReserve: INITIAL_BTC,
      virtualTokenSupply: INITIAL_TOKEN,
      kConstant: K,
      amount: 1_000_000_000n,
    },
    expectedBuy: {
      tokensOut: INITIAL_TOKEN - K / (INITIAL_BTC + 1_000_000_000n),
      newVirtualBtcReserve: INITIAL_BTC + 1_000_000_000n,
      newVirtualTokenSupply: K / (INITIAL_BTC + 1_000_000_000n),
    },
    expectedSell: {
      btcOut: INITIAL_BTC - K / (INITIAL_TOKEN + 1_000_000_000n),
      newVirtualBtcReserve: K / (INITIAL_TOKEN + 1_000_000_000n),
      newVirtualTokenSupply: INITIAL_TOKEN + 1_000_000_000n,
    },
  },
];

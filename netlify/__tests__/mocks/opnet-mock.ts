/**
 * Mock for opnet and @btc-vision/bitcoin modules.
 * Used by on-chain-verify.mts and indexer-core.mts.
 */
import { vi } from 'vitest';

// Configurable mock state
export const opnetMockState = {
  transaction: null as Record<string, unknown> | null,
  blockNumber: 100n,
  reserves: {
    properties: {
      virtualBtc: 767_000n,
      virtualToken: 100_000_000_000_000_000n,
      realBtc: 0n,
      k: 76_700_000_000_000_000_000_000n,
    },
  },
  config: {
    properties: {
      creatorBps: 0n,
      buyTax: 0n,
      sellTax: 0n,
      destination: 0n,
      threshold: 6_900_000n,
    },
  },
  blocks: new Map<number, Record<string, unknown>>(),
};

export function resetOpnetMock(): void {
  opnetMockState.transaction = {
    from: 'bc1ptestcccccccccccccccccccccccccccccccccccc',
    deployerAddress: 'bc1ptestcccccccccccccccccccccccccccccccccccc',
    blockNumber: 100n,
  };
  opnetMockState.blockNumber = 100n;
  opnetMockState.reserves = {
    properties: {
      virtualBtc: 767_000n,
      virtualToken: 100_000_000_000_000_000n,
      realBtc: 0n,
      k: 76_700_000_000_000_000_000_000n,
    },
  };
  opnetMockState.config = {
    properties: {
      creatorBps: 0n,
      buyTax: 0n,
      sellTax: 0n,
      destination: 0n,
      threshold: 6_900_000n,
    },
  };
  opnetMockState.blocks.clear();
}

vi.mock('opnet', () => ({
  JSONRpcProvider: class {
    constructor(_config: unknown) {}
    async getTransaction(hash: string) {
      return opnetMockState.transaction;
    }
    async getBlockNumber() {
      return opnetMockState.blockNumber;
    }
    async getBlock(num: number | bigint) {
      return opnetMockState.blocks.get(Number(num)) ?? { transactions: [] };
    }
  },
  getContract: (_address: string, _abi: unknown, _provider: unknown, _network: unknown) => ({
    getReserves: async () => opnetMockState.reserves,
    getConfig: async () => opnetMockState.config,
  }),
  ABIDataTypes: {
    UINT256: 'UINT256',
    ADDRESS: 'ADDRESS',
    STRING: 'STRING',
    BOOL: 'BOOL',
    BYTES: 'BYTES',
  },
  BitcoinAbiTypes: {
    Function: 'Function',
    Event: 'Event',
  },
}));

vi.mock('@btc-vision/bitcoin', () => ({
  networks: {
    bitcoin: { bech32: 'bc', bech32Opnet: 'op', pubKeyHash: 0x00 },
    opnetTestnet: { bech32: 'tb', bech32Opnet: 'opt', pubKeyHash: 0x6f },
    regtest: { bech32: 'bcrt', bech32Opnet: 'oprt', pubKeyHash: 0x6f },
    testnet: { bech32: 'tb', pubKeyHash: 0x6f },
  },
  toBech32: (data: Uint8Array, version: number, prefix: string, _opnetPrefix?: string) => {
    // Simplified mock — returns a deterministic fake bech32m address
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${prefix}1p${hex.slice(0, 40)}`;
  },
}));

import { describe, it, expect } from 'vitest';
import { resolveTxId } from '../../functions/_shared/indexer-core.mts';

describe('resolveTxId()', () => {
  it('returns tx.id when RPC returns both id and hash', async () => {
    const mockProvider = {
      getTransaction: async (_hash: string) => ({ id: 'txid_abc', hash: 'wtxid_xyz' }),
    };
    const result = await resolveTxId(mockProvider, 'wtxid_xyz');
    expect(result).toBe('txid_abc');
  });

  it('falls back to wtxid when RPC returns null', async () => {
    const mockProvider = {
      getTransaction: async (_hash: string) => null,
    };
    const result = await resolveTxId(mockProvider, 'wtxid_xyz');
    expect(result).toBe('wtxid_xyz');
  });

  it('falls back to wtxid when tx.id is undefined', async () => {
    const mockProvider = {
      getTransaction: async (_hash: string) => ({ hash: 'wtxid_xyz' }),
    };
    const result = await resolveTxId(mockProvider, 'wtxid_xyz');
    expect(result).toBe('wtxid_xyz');
  });

  it('falls back to wtxid when RPC throws', async () => {
    const mockProvider = {
      getTransaction: async (_hash: string) => { throw new Error('RPC unavailable'); },
    };
    const result = await resolveTxId(mockProvider, 'wtxid_xyz');
    expect(result).toBe('wtxid_xyz');
  });
});

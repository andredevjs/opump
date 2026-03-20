/**
 * Mock for @netlify/blobs — in-memory blob store.
 */
import { vi } from 'vitest';

const blobStores = new Map<string, Map<string, { data: ArrayBuffer; metadata: Record<string, string> }>>();

function getOrCreateStore(name: string) {
  if (!blobStores.has(name)) {
    blobStores.set(name, new Map());
  }
  return blobStores.get(name)!;
}

export function resetBlobStore(): void {
  blobStores.clear();
}

vi.mock('@netlify/blobs', () => ({
  getStore: (name: string) => {
    const s = getOrCreateStore(name);
    return {
      async set(key: string, data: ArrayBuffer, opts?: { metadata?: Record<string, string> }) {
        s.set(key, { data, metadata: opts?.metadata || {} });
      },
      async get(key: string): Promise<ArrayBuffer | null> {
        const entry = s.get(key);
        return entry ? entry.data : null;
      },
      async getWithMetadata(key: string): Promise<{ data: ArrayBuffer; metadata: Record<string, string> } | null> {
        return s.get(key) ?? null;
      },
    };
  },
}));

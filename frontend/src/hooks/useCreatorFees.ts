import { useState, useEffect, useCallback, useRef } from 'react';

export interface TokenFeeState {
  tokenAddress: string;
  claimableSats: number | null;
  error: string | null;
  claiming: boolean;
  claimResult: string | null;
}

interface UseCreatorFeesResult {
  fees: Map<string, TokenFeeState>;
  totalClaimableSats: number;
  loading: boolean;
  claim: (tokenAddress: string, walletAddress: string) => Promise<void>;
}

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch creator fee pools for multiple tokens and provide per-token claim functionality.
 * Batches RPC calls in groups to avoid rate limits.
 */
export function useCreatorFees(tokenAddresses: string[], enabled: boolean): UseCreatorFeesResult {
  const [fees, setFees] = useState<Map<string, TokenFeeState>>(new Map());
  const [loading, setLoading] = useState(false);
  const cancelledRef = useRef(false);

  // Stable reference for addresses to avoid re-fetching on every render
  const addressesKey = tokenAddresses.join(',');

  const fetchAllFees = useCallback(async () => {
    if (!enabled || tokenAddresses.length === 0) return;
    setLoading(true);
    cancelledRef.current = false;

    const { getLaunchTokenContract } = await import('@/services/contract');

    for (let i = 0; i < tokenAddresses.length; i += BATCH_SIZE) {
      if (cancelledRef.current) return;
      const batch = tokenAddresses.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (addr) => {
          try {
            const contract = getLaunchTokenContract(addr);
            const result = await contract.getFeePools();
            if (cancelledRef.current) return;
            if (result.revert) {
              setFees((prev) => {
                const next = new Map(prev);
                next.set(addr, {
                  tokenAddress: addr,
                  claimableSats: null,
                  error: `Contract reverted: ${result.revert}`,
                  claiming: false,
                  claimResult: null,
                });
                return next;
              });
              return;
            }
            setFees((prev) => {
              const next = new Map(prev);
              next.set(addr, {
                tokenAddress: addr,
                claimableSats: Number(result.properties.creatorFees),
                error: null,
                claiming: false,
                claimResult: null,
              });
              return next;
            });
          } catch (err) {
            if (cancelledRef.current) return;
            setFees((prev) => {
              const next = new Map(prev);
              next.set(addr, {
                tokenAddress: addr,
                claimableSats: null,
                error: err instanceof Error ? err.message : 'Failed to load fees',
                claiming: false,
                claimResult: null,
              });
              return next;
            });
          }
        }),
      );

      // Stagger between batches
      if (i + BATCH_SIZE < tokenAddresses.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    if (!cancelledRef.current) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey, enabled]);

  useEffect(() => {
    fetchAllFees();
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchAllFees]);

  const claim = useCallback(async (tokenAddress: string, walletAddress: string) => {
    setFees((prev) => {
      const next = new Map(prev);
      const entry = next.get(tokenAddress);
      if (entry) next.set(tokenAddress, { ...entry, claiming: true, claimResult: null });
      return next;
    });

    try {
      const { getLaunchTokenContract, sendContractCall } = await import('@/services/contract');
      const contract = getLaunchTokenContract(tokenAddress);
      const sim = await contract.claimCreatorFees();
      const receipt = await sendContractCall(sim, { refundTo: walletAddress });

      // Mempool-first: optimistically set to 0
      setFees((prev) => {
        const next = new Map(prev);
        next.set(tokenAddress, {
          tokenAddress,
          claimableSats: 0,
          error: null,
          claiming: false,
          claimResult: `Claimed! Tx: ${receipt.txHash.slice(0, 12)}...`,
        });
        return next;
      });
    } catch (err) {
      setFees((prev) => {
        const next = new Map(prev);
        const entry = next.get(tokenAddress);
        next.set(tokenAddress, {
          tokenAddress,
          claimableSats: entry?.claimableSats ?? null,
          error: null,
          claiming: false,
          claimResult: err instanceof Error ? err.message : 'Claim failed',
        });
        return next;
      });
    }
  }, []);

  let totalClaimableSats = 0;
  for (const entry of fees.values()) {
    if (entry.claimableSats != null && entry.claimableSats > 0) {
      totalClaimableSats += entry.claimableSats;
    }
  }

  return { fees, totalClaimableSats, loading, claim };
}

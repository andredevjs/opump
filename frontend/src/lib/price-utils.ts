/**
 * Derive the optimistic 24h price change percentage after a trade.
 *
 * The 24h reference price (price 24h ago) doesn't change when a trade happens —
 * only the current price does. We back-derive the reference price from the old
 * state and recompute the percentage with the new price:
 *
 *   refPrice = oldPrice / (1 + oldChange24h / 100)
 *   newChange = ((newPrice - refPrice) / refPrice) * 100
 */
export function computeOptimistic24hChange(
  oldPriceSats: number,
  oldChange24h: number,
  newPriceSats: number,
): number {
  if (!oldPriceSats || oldPriceSats <= 0) return 0;
  const refPrice = oldPriceSats / (1 + oldChange24h / 100);
  if (!refPrice || refPrice <= 0 || !isFinite(refPrice)) return 0;
  return ((newPriceSats - refPrice) / refPrice) * 100;
}

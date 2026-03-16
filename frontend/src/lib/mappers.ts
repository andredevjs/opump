import type { TokenDetailResponse } from '@shared/types/api';
import type { Token } from '@/types/token';

/**
 * Map an API token response to the frontend Token type.
 * Single source of truth for API → frontend conversion.
 */
export function mapApiTokenToToken(t: TokenDetailResponse & { priceChange24hBps?: number }): Token {
  const threshold = parseFloat(t.config.graduationThreshold);

  return {
    address: t._id,
    name: t.name,
    symbol: t.symbol,
    description: t.description,
    image: t.name.charAt(0)?.toUpperCase() || '?',
    imageUrl: t.imageUrl || undefined,
    creatorAddress: t.creatorAddress,
    createdAt: new Date(t.createdAt).getTime(),
    virtualBtcReserve: t.virtualBtcReserve,
    virtualTokenSupply: t.virtualTokenSupply,
    realBtcReserve: t.realBtcReserve,
    currentPriceSats: parseFloat(t.currentPriceSats),
    priceChange24h: (t.priceChange24hBps ?? 0) / 100,
    volume24hSats: parseFloat(t.volume24h),
    marketCapSats: parseFloat(t.marketCapSats),
    holderCount: t.holderCount,
    tradeCount24h: t.tradeCount24h ?? t.tradeCount,
    creatorAllocationPercent: (t.config.creatorAllocationBps || 0) / 100,
    buyTaxPercent: (t.config.buyTaxBps || 0) / 100,
    sellTaxPercent: (t.config.sellTaxBps || 0) / 100,
    website: t.socials?.website,
    twitter: t.socials?.twitter,
    telegram: t.socials?.telegram,
    discord: t.socials?.discord,
    github: t.socials?.github,
    status: t.status,
    graduationProgress: threshold > 0
      ? (parseFloat(t.realBtcReserve) / threshold) * 100
      : 0,
  };
}

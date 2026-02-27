import type { PlatformStats } from '@/types/api';
import { MOCK_TOKENS } from './tokens';

export function getPlatformStats(): PlatformStats {
  const graduated = MOCK_TOKENS.filter(t => t.status === 'graduated').length;
  const totalVolume = MOCK_TOKENS.reduce((sum, t) => sum + t.volume24hSats * 15, 0);
  const totalTrades = MOCK_TOKENS.reduce((sum, t) => sum + t.tradeCount24h * 15, 0);

  return {
    totalTokensLaunched: 247,
    totalGraduated: graduated > 0 ? graduated : 12,
    totalVolumeSats: totalVolume > 0 ? totalVolume : 14_270_000_000,
    totalTrades: totalTrades > 0 ? totalTrades : 18_420,
    activeTokens: MOCK_TOKENS.filter(t => t.status === 'active').length + 180,
  };
}

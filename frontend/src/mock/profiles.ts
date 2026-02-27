import type { CreatorProfile } from '@/types/api';
import { MOCK_TOKENS } from './tokens';

const DISPLAY_NAMES = [
  'SatoshiFan42', 'BTCMaxi', 'OPNetBuilder', 'MotoLover', 'CryptoWizard',
  'BlockEngineer', 'NodeRunner', 'HashHunter', 'ChainGuru', 'BitPioneer',
];

export function getCreatorProfile(address: string): CreatorProfile {
  const tokens = MOCK_TOKENS.filter(t => t.creatorAddress === address);
  const idx = Math.abs(address.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % DISPLAY_NAMES.length;

  return {
    address,
    displayName: DISPLAY_NAMES[idx],
    tokensLaunched: tokens.length,
    totalVolumeSats: tokens.reduce((sum, t) => sum + t.volume24hSats * 10, 0),
    joinedAt: tokens.length > 0
      ? Math.min(...tokens.map(t => t.createdAt))
      : Date.now() - 30 * 86400_000,
  };
}

export function getCreatorTokens(address: string) {
  return MOCK_TOKENS.filter(t => t.creatorAddress === address);
}

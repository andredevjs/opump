import type { TokenStatus } from '@/types/token';
import { Badge } from '@/components/ui/Badge';

export function isTokenPending(token: { deployBlock?: number }): boolean {
  return !token.deployBlock;
}

export function TokenBadge({ status, deployBlock }: { status: TokenStatus; deployBlock?: number }) {
  if (isTokenPending({ deployBlock })) {
    return <Badge variant="warning">Pending</Badge>;
  }

  switch (status) {
    case 'migrated':
      return <Badge variant="bull">On DEX</Badge>;
    case 'migrating':
      return <Badge variant="warning">Migrating</Badge>;
    case 'graduated':
      return <Badge variant="bull">Graduated</Badge>;
    case 'new':
      return <Badge variant="accent">New</Badge>;
    default:
      return <Badge variant="outline">Active</Badge>;
  }
}

import type { TokenStatus } from '@/types/token';
import { Badge } from '@/components/ui/Badge';

export function TokenBadge({ status }: { status: TokenStatus }) {
  switch (status) {
    case 'migrated':
      return <Badge variant="bull">On MotoSwap DEX</Badge>;
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

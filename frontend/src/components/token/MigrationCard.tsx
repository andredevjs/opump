import type { Token } from '@/types/token';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

const MOTOSWAP_URL = import.meta.env.VITE_MOTOSWAP_URL || '';

interface MigrationCardProps {
  token: Token;
  walletAddress: string | null;
  isCreator: boolean;
  migrating: boolean;
  onMigrate: () => void;
}

export function MigrationCard({ token, walletAddress, isCreator, migrating, onMigrate }: MigrationCardProps) {
  if (token.status === 'migrated') {
    return (
      <Card className="text-center py-8">
        <Badge variant="bull" className="mb-3 text-base px-4 py-1">Trading on MotoSwap</Badge>
        <p className="text-text-secondary text-sm mt-2">
          This OP20 token has migrated to MotoSwap DEX for open-market trading.
        </p>
        {MOTOSWAP_URL && (
          <a
            href={`${MOTOSWAP_URL}/swap?token=${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-4 px-6 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Trade on MotoSwap
          </a>
        )}
      </Card>
    );
  }

  if (token.status === 'migrating') {
    return (
      <Card className="text-center py-8">
        <Badge variant="warning" className="mb-3 text-base px-4 py-1 animate-pulse">Migrating</Badge>
        <p className="text-text-secondary text-sm mt-2">
          This token is being migrated to MotoSwap DEX.
        </p>
        <p className="text-text-muted text-xs mt-1">
          Liquidity pool creation in progress. Trading will be available shortly.
        </p>
        <div className="mt-4 flex justify-center">
          <div className="h-5 w-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  // status === 'graduated'
  return (
    <Card className="text-center py-8">
      <Badge variant="warning" className="mb-3 text-base px-4 py-1">Graduated</Badge>
      <p className="text-text-secondary text-sm mt-2">
        This token has graduated from the bonding curve.
      </p>

      {isCreator ? (
        <>
          <p className="text-text-muted text-xs mt-1">
            As the token creator, you can migrate liquidity to DEX.
          </p>
          <button
            onClick={onMigrate}
            disabled={migrating || !walletAddress}
            className="mt-4 px-6 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            {migrating ? (
              <>
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Migrating...
              </>
            ) : (
              'Migrate to DEX'
            )}
          </button>
        </>
      ) : (
        <p className="text-text-muted text-xs mt-1">
          Waiting for the token creator to initiate DEX migration.
        </p>
      )}
    </Card>
  );
}

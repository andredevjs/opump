import { TokenCard } from '@/components/token/TokenCard';
import type { Token } from '@/types/token';

interface CreatedTokensProps {
  tokens: Token[];
}

export function CreatedTokens({ tokens }: CreatedTokensProps) {
  if (tokens.length === 0) {
    return (
      <div className="text-center py-12 text-text-muted">
        <p>No tokens launched yet.</p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {tokens.map((token) => (
        <TokenCard key={token.address} token={token} />
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import { TokenCard } from '@/components/token/TokenCard';
import { MOCK_TOKENS } from '@/mock/tokens';
import { Button } from '@/components/ui/Button';
import { ArrowRight } from 'lucide-react';

export function TopTokens() {
  const top = [...MOCK_TOKENS]
    .sort((a, b) => b.volume24hSats - a.volume24hSats)
    .slice(0, 4);

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Trending Tokens</h2>
        <Link to="/trenches">
          <Button variant="ghost" size="sm">
            View All <ArrowRight size={14} className="ml-1" />
          </Button>
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {top.map((token) => (
          <TokenCard key={token.address} token={token} />
        ))}
      </div>
    </section>
  );
}

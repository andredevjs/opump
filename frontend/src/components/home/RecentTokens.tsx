import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { TokenCard } from '@/components/token/TokenCard';
import { Button } from '@/components/ui/Button';
import { ArrowRight } from 'lucide-react';
import type { Token } from '@/types/token';
import * as api from '@/services/api';
import { mapApiTokenToToken } from '@/lib/mappers';

const POLL_INTERVAL_MS = 5_000;

export function RecentTokens() {
  const [tokens, setTokens] = useState<Token[]>([]);

  const refresh = useCallback(() => {
    api.getTokens({ sort: 'newest', order: 'desc', limit: 6 }).then((res) => {
      setTokens(res.tokens.map(mapApiTokenToToken));
    }).catch(() => {
      // Keep existing on error
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Recent Launches</h2>
        <Link to="/fields">
          <Button variant="ghost" size="sm">
            View All <ArrowRight size={14} className="ml-1" />
          </Button>
        </Link>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tokens.map((token) => (
          <TokenCard key={token.address} token={token} />
        ))}
      </div>
    </section>
  );
}

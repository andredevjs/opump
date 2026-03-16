import { useState, useEffect } from 'react';
import { Search, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { TokenCard } from '@/components/token/TokenCard';
import { TokenList } from '@/components/token/TokenList';
import { useTokenStore } from '@/stores/token-store';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/cn';
import type { TokenStatus, TokenSortOption } from '@/types/token';

const STATUS_FILTERS: { label: string; value: TokenStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Graduated', value: 'graduated' },
  { label: 'On DEX', value: 'migrated' },
  { label: 'New', value: 'new' },
];

const SORT_OPTIONS: TokenSortOption[] = [
  { label: 'Volume', value: 'volume' },
  { label: 'Market Cap', value: 'marketCap' },
  { label: 'Price', value: 'price' },
  { label: 'Newest', value: 'newest' },
];

export function TrenchesPage() {
  const { tokens, filter, setFilter, loading: _loading, pagination, fetchTokens } = useTokenStore();
  const { viewMode, setViewMode } = useUIStore();
  const [page, setPage] = useState(1);

  // Fetch tokens on mount + periodic refresh
  useEffect(() => {
    fetchTokens();
    const id = setInterval(fetchTokens, 5_000);
    return () => clearInterval(id);
  }, [fetchTokens]);

  useEffect(() => {
    const handler = () => fetchTokens();
    window.addEventListener('opump:trade', handler);
    return () => window.removeEventListener('opump:trade', handler);
  }, [fetchTokens]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [filter.search, filter.status, filter.sort]);

  const totalPages = pagination.totalPages;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-text-primary mb-6">The Trenches</h1>

      {/* Search + Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search tokens..."
            value={filter.search}
            onChange={(e) => setFilter({ search: e.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter.sort}
            onChange={(e) => setFilter({ sort: e.target.value as TokenSortOption['value'] })}
            className="h-10 px-3 rounded-lg bg-input border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-2.5', viewMode === 'grid' ? 'bg-accent/10 text-accent' : 'bg-elevated text-text-muted')}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-2.5', viewMode === 'list' ? 'bg-accent/10 text-accent' : 'bg-elevated text-text-muted')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((sf) => (
          <button
            key={sf.value}
            onClick={() => setFilter({ status: sf.value })}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filter.status === sf.value
                ? 'bg-accent/10 text-accent'
                : 'text-text-muted hover:text-text-secondary hover:bg-elevated',
            )}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {/* Token display */}
      {tokens.length === 0 ? (
        <div className="text-center py-16 text-text-muted">
          <p className="text-lg">No tokens found</p>
          <p className="text-sm mt-1">Try adjusting your search or filters.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tokens.map((token) => (
            <TokenCard key={token.address} token={token} />
          ))}
        </div>
      ) : (
        <TokenList tokens={tokens} />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft size={16} />
          </Button>
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { TrenchTokenRow } from '@/components/token/TrenchTokenRow';
import { useTrenchesStore, type ColumnKey } from '@/stores/trenches-store';
import { cn } from '@/lib/cn';

interface TrenchColumnProps {
  title: string;
  icon: ReactNode;
  columnKey: ColumnKey;
  className?: string;
}

export function TrenchColumn({ title, icon, columnKey, className }: TrenchColumnProps) {
  const column = useTrenchesStore((s) => s.columns[columnKey]);
  const loadMore = useTrenchesStore((s) => s.loadMore);
  const setColumnSearch = useTrenchesStore((s) => s.setColumnSearch);

  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setColumnSearch(columnKey, value);
      }, 300);
    },
    [columnKey, setColumnSearch],
  );

  const handleCloseSearch = useCallback(() => {
    setShowSearch(false);
    setSearchInput('');
    clearTimeout(debounceRef.current);
    setColumnSearch(columnKey, '');
  }, [columnKey, setColumnSearch]);

  // Cleanup debounce
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore(columnKey);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [columnKey, loadMore]);

  const { tokens, loading, hasMore } = column;
  const showSkeleton = loading && tokens.length === 0;
  const showEmpty = !loading && tokens.length === 0;

  return (
    <div
      className={cn(
        'flex flex-col min-h-0 rounded-xl bg-card border border-border overflow-hidden',
        className,
      )}
    >
      {/* Sticky header */}
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-text-muted">{icon}</span>
            <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
            {tokens.length > 0 && (
              <span className="text-xs text-text-muted">({tokens.length})</span>
            )}
          </div>
          <button
            onClick={() => (showSearch ? handleCloseSearch() : setShowSearch(true))}
            className="p-1.5 rounded-md hover:bg-elevated text-text-muted hover:text-text-primary transition-colors"
          >
            {showSearch ? <X size={14} /> : <Search size={14} />}
          </button>
        </div>

        {/* Collapsible search */}
        {showSearch && (
          <div className="mt-2">
            <Input
              placeholder={`Search ${title.toLowerCase()}...`}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Scrollable token list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {showSkeleton && (
          <div className="p-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3">
                <div className="w-12 h-12 rounded-lg bg-elevated" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3 bg-elevated rounded w-3/4" />
                  <div className="h-2.5 bg-elevated rounded w-1/2" />
                  <div className="h-2.5 bg-elevated rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {showEmpty && (
          <div className="flex items-center justify-center py-12 px-4">
            <p className="text-sm text-text-muted text-center">
              No tokens found
            </p>
          </div>
        )}

        {tokens.length > 0 && (
          <div className="divide-y divide-border/50">
            {tokens.map((token) => (
              <TrenchTokenRow key={token.address} token={token} />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        {hasMore && tokens.length > 0 && (
          <div ref={sentinelRef} className="h-8 flex items-center justify-center">
            {loading && (
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

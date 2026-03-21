import { useEffect } from 'react';
import { Sparkles, Flame, GraduationCap } from 'lucide-react';
import { TrenchColumn } from '@/components/fields/TrenchColumn';
import { useTrenchesStore, type ColumnKey } from '@/stores/trenches-store';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';

const COLUMNS: { key: ColumnKey; title: string; icon: React.ReactNode }[] = [
  { key: 'new', title: 'New', icon: <Sparkles size={16} /> },
  { key: 'edging', title: 'Edging', icon: <Flame size={16} /> },
  { key: 'graduated', title: 'Graduated', icon: <GraduationCap size={16} /> },
];

export function FieldsPage() {
  const fetchColumn = useTrenchesStore((s) => s.fetchColumn);

  // Initial fetch + 5s polling (silent refresh)
  useEffect(() => {
    const keys: ColumnKey[] = ['new', 'edging', 'graduated'];
    keys.forEach((k) => fetchColumn(k));

    const id = setInterval(() => {
      keys.forEach((k) => fetchColumn(k, true));
    }, 5_000);

    return () => clearInterval(id);
  }, [fetchColumn]);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Desktop: 3-column grid */}
      <div className="hidden lg:grid grid-cols-3 gap-4 flex-1 min-h-0 px-4 pb-4 pt-4">
        {COLUMNS.map((col) => (
          <TrenchColumn
            key={col.key}
            title={col.title}
            icon={col.icon}
            columnKey={col.key}
          />
        ))}
      </div>

      {/* Mobile: tabs */}
      <div className="lg:hidden flex-1 flex flex-col min-h-0 px-4 pb-4 pt-4">
        <TabsRoot defaultValue="new" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-shrink-0">
            {COLUMNS.map((col) => (
              <TabsTrigger key={col.key} value={col.key} className="flex items-center gap-1.5">
                {col.icon}
                {col.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {COLUMNS.map((col) => (
            <TabsContent
              key={col.key}
              value={col.key}
              className="flex-1 min-h-0 !pt-2"
            >
              <TrenchColumn
                title={col.title}
                icon={col.icon}
                columnKey={col.key}
                className="h-full"
              />
            </TabsContent>
          ))}
        </TabsRoot>
      </div>
    </div>
  );
}

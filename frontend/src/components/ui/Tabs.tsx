import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from '@/lib/cn';

export const TabsRoot = RadixTabs.Root;

export function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <RadixTabs.List
      className={cn(
        'flex gap-1 border-b border-border pb-px',
        className,
      )}
    >
      {children}
    </RadixTabs.List>
  );
}

export function TabsTrigger({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) {
  return (
    <RadixTabs.Trigger
      value={value}
      className={cn(
        'px-4 py-2 text-sm font-medium text-text-secondary rounded-t-lg transition-colors',
        'hover:text-text-primary hover:bg-elevated',
        'data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent',
        className,
      )}
    >
      {children}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ children, value, className }: { children: React.ReactNode; value: string; className?: string }) {
  return (
    <RadixTabs.Content value={value} className={cn('pt-4', className)}>
      {children}
    </RadixTabs.Content>
  );
}

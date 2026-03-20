import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'accent' | 'bull' | 'bear' | 'pending' | 'outline' | 'warning';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        {
          'bg-elevated text-text-secondary': variant === 'default',
          'bg-accent/10 text-accent': variant === 'accent',
          'bg-bull/10 text-bull': variant === 'bull',
          'bg-bear/10 text-bear': variant === 'bear',
          'bg-pending/10 text-pending': variant === 'pending',
          'border border-border text-text-secondary': variant === 'outline',
          'bg-accent/10 text-accent': variant === 'warning',
        },
        className,
      )}
    >
      {children}
    </span>
  );
}

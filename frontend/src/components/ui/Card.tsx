import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
}

export function Card({ children, hover = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl bg-card border border-border p-4',
        hover && 'hover:border-accent/30 hover:bg-elevated transition-colors cursor-pointer',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

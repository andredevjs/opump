import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'bull' | 'bear';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-accent hover:bg-accent-hover text-white': variant === 'primary',
            'bg-elevated hover:bg-input text-text-primary border border-border': variant === 'secondary',
            'bg-transparent hover:bg-elevated text-text-secondary hover:text-text-primary': variant === 'ghost',
            'bg-bear/10 hover:bg-bear/20 text-bear': variant === 'danger',
            'bg-bull/10 hover:bg-bull/20 text-bull border border-bull/20': variant === 'bull',
            'bg-bear/10 hover:bg-bear/20 text-bear border border-bear/20': variant === 'bear',
          },
          {
            'h-8 px-3 text-sm': size === 'sm',
            'h-10 px-4 text-sm': size === 'md',
            'h-12 px-6 text-base': size === 'lg',
          },
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

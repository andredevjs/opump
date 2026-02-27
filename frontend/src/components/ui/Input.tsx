import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            'w-full h-10 px-3 rounded-lg bg-input border text-text-primary text-sm',
            'placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
            'transition-colors',
            error ? 'border-bear' : 'border-border',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-bear">{error}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

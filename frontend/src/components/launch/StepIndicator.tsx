import type { LaunchStep } from '@/types/launch';
import { cn } from '@/lib/cn';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: LaunchStep;
}

const STEPS = [
  { num: 1, label: 'Details' },
  { num: 2, label: 'Socials' },
  { num: 3, label: 'Allocation' },
  { num: 4, label: 'Airdrop' },
  { num: 5, label: 'Tax' },
  { num: 6, label: 'Deploy' },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full max-w-lg mx-auto mb-8">
      {STEPS.map((step, i) => {
        const isActive = step.num === currentStep;
        const isCompleted = step.num < currentStep;

        return (
          <div key={step.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                  isCompleted && 'bg-accent text-white',
                  isActive && 'bg-accent/20 text-accent border-2 border-accent',
                  !isActive && !isCompleted && 'bg-elevated text-text-muted',
                )}
              >
                {isCompleted ? <Check size={14} /> : step.num}
              </div>
              <span className={cn(
                'text-xs mt-1.5 hidden sm:block',
                isActive ? 'text-accent' : 'text-text-muted',
              )}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                'w-8 sm:w-12 h-px mx-1',
                isCompleted ? 'bg-accent' : 'bg-border',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { Lock } from 'lucide-react';

export function StepAirdrop() {
  const { updateForm, nextStep, prevStep } = useLaunchStore();

  useEffect(() => {
    updateForm({ airdropEnabled: false });
  }, [updateForm]);

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Community Airdrop</h3>
        <p className="text-sm text-text-secondary">
          Distribute tokens to existing Bitcoin communities.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-elevated border border-border text-center">
        <div className="w-12 h-12 rounded-full bg-input flex items-center justify-center mb-4">
          <Lock size={24} className="text-text-muted" />
        </div>
        <h4 className="text-base font-semibold text-text-primary mb-2">Coming Soon</h4>
        <p className="text-sm text-text-muted max-w-xs">
          Airdrop functionality is under development. You'll be able to distribute tokens to $MOTO holders, MotoCAT NFT holders, or custom address lists.
        </p>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={prevStep} className="flex-1" size="lg">
          Back
        </Button>
        <Button onClick={nextStep} className="flex-1" size="lg">
          Next: Flywheel Tax
        </Button>
      </div>
    </div>
  );
}

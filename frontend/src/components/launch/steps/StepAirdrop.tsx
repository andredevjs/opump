import * as Switch from '@radix-ui/react-switch';
import * as Slider from '@radix-ui/react-slider';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { cn } from '@/lib/cn';
import type { AirdropType } from '@/types/launch';

const AIRDROP_OPTIONS: { value: AirdropType; label: string; description: string }[] = [
  { value: 'moto_holders', label: '$MOTO Holders', description: '~8,200 addresses' },
  { value: 'motocat_holders', label: 'MotoCAT NFT', description: '~2,800 addresses' },
  { value: 'custom', label: 'Custom List', description: 'Your addresses' },
];

export function StepAirdrop() {
  const { formData, updateForm, nextStep, prevStep } = useLaunchStore();

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Community Airdrop</h3>
        <p className="text-sm text-text-secondary">
          Distribute tokens to existing Bitcoin communities.
        </p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-elevated">
        <span className="text-sm text-text-primary">Enable Airdrop</span>
        <Switch.Root
          checked={formData.airdropEnabled}
          onCheckedChange={(checked) => updateForm({ airdropEnabled: checked })}
          className="w-11 h-6 bg-input rounded-full relative data-[state=checked]:bg-accent transition-colors"
        >
          <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-md transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {formData.airdropEnabled && (
        <div className="space-y-4">
          <div className="grid gap-2">
            {AIRDROP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateForm({ airdropType: opt.value })}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                  formData.airdropType === opt.value
                    ? 'border-accent bg-accent/5'
                    : 'border-border bg-elevated hover:border-accent/30',
                )}
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                  <p className="text-xs text-text-muted">{opt.description}</p>
                </div>
                <div className={cn(
                  'w-4 h-4 rounded-full border-2',
                  formData.airdropType === opt.value ? 'border-accent bg-accent' : 'border-border',
                )} />
              </button>
            ))}
          </div>

          {formData.airdropType === 'custom' && (
            <textarea
              className="w-full h-20 px-3 py-2 rounded-lg bg-input border border-border text-text-primary text-sm font-mono placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
              placeholder="bc1q..., bc1q..., bc1q..."
              value={formData.customAddresses}
              onChange={(e) => updateForm({ customAddresses: e.target.value })}
            />
          )}

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-secondary">Airdrop Allocation</span>
              <span className="font-mono text-accent">{formData.airdropPercent}%</span>
            </div>
            <Slider.Root
              value={[formData.airdropPercent]}
              onValueChange={([v]) => updateForm({ airdropPercent: v })}
              min={0.1}
              max={20}
              step={0.1}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track className="bg-input relative grow rounded-full h-2">
                <Slider.Range className="absolute bg-accent rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 bg-accent rounded-full shadow-md hover:bg-accent-hover focus:outline-none" />
            </Slider.Root>
          </div>
        </div>
      )}

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

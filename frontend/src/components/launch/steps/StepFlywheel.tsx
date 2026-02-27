import * as Switch from '@radix-ui/react-switch';
import * as Slider from '@radix-ui/react-slider';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { MAX_BUY_TAX_PERCENT, MAX_SELL_TAX_PERCENT } from '@/config/constants';
import { cn } from '@/lib/cn';
import type { TaxDestination } from '@/types/launch';

const TAX_DESTINATIONS: { value: TaxDestination; label: string; description: string }[] = [
  { value: 'burn', label: 'Burn', description: 'Reduce supply over time' },
  { value: 'community_pool', label: 'Community Pool', description: 'Shared treasury' },
  { value: 'creator_wallet', label: 'Creator Wallet', description: 'Direct to you' },
];

export function StepFlywheel() {
  const { formData, updateForm, nextStep, prevStep } = useLaunchStore();

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Flywheel Tax</h3>
        <p className="text-sm text-text-secondary">
          Optional buy/sell tax to fund the ecosystem.
        </p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-lg bg-elevated">
        <span className="text-sm text-text-primary">Enable Flywheel Tax</span>
        <Switch.Root
          checked={formData.flywheelEnabled}
          onCheckedChange={(checked) => updateForm({ flywheelEnabled: checked })}
          className="w-11 h-6 bg-input rounded-full relative data-[state=checked]:bg-accent transition-colors"
        >
          <Switch.Thumb className="block w-5 h-5 bg-white rounded-full shadow-md transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
        </Switch.Root>
      </div>

      {formData.flywheelEnabled && (
        <div className="space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-secondary">Buy Tax</span>
              <span className="font-mono text-accent">{formData.buyTaxPercent}%</span>
            </div>
            <Slider.Root
              value={[formData.buyTaxPercent]}
              onValueChange={([v]) => updateForm({ buyTaxPercent: v })}
              max={MAX_BUY_TAX_PERCENT}
              step={0.25}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track className="bg-input relative grow rounded-full h-2">
                <Slider.Range className="absolute bg-accent rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 bg-accent rounded-full shadow-md hover:bg-accent-hover focus:outline-none" />
            </Slider.Root>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-secondary">Sell Tax</span>
              <span className="font-mono text-accent">{formData.sellTaxPercent}%</span>
            </div>
            <Slider.Root
              value={[formData.sellTaxPercent]}
              onValueChange={([v]) => updateForm({ sellTaxPercent: v })}
              max={MAX_SELL_TAX_PERCENT}
              step={0.25}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track className="bg-input relative grow rounded-full h-2">
                <Slider.Range className="absolute bg-accent rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 bg-accent rounded-full shadow-md hover:bg-accent-hover focus:outline-none" />
            </Slider.Root>
          </div>

          <div>
            <p className="text-sm text-text-secondary mb-2">Tax Destination</p>
            <div className="grid gap-2">
              {TAX_DESTINATIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateForm({ taxDestination: opt.value })}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                    formData.taxDestination === opt.value
                      ? 'border-accent bg-accent/5'
                      : 'border-border bg-elevated hover:border-accent/30',
                  )}
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                    <p className="text-xs text-text-muted">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={prevStep} className="flex-1" size="lg">
          Back
        </Button>
        <Button onClick={nextStep} className="flex-1" size="lg">
          Next: Deploy
        </Button>
      </div>
    </div>
  );
}

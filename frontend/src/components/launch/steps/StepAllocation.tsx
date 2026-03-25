import * as Slider from '@radix-ui/react-slider';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { MAX_COMBINED_ALLOCATION_PERCENT } from '@/config/constants';

export function StepAllocation() {
  const { formData, updateForm, nextStep, prevStep } = useLaunchStore();

  const airdropPercent = formData.airdropEnabled ? formData.airdropPercent : 0;
  const maxCreator = MAX_COMBINED_ALLOCATION_PERCENT - airdropPercent;
  const curvePercent = 100 - formData.creatorAllocationPercent - airdropPercent;

  // Clamp creator allocation if airdrop increased and pushed it over
  if (formData.creatorAllocationPercent > maxCreator) {
    updateForm({ creatorAllocationPercent: maxCreator });
  }

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Creator Allocation</h3>
        <p className="text-sm text-text-secondary">
          Reserve a percentage of the token supply for yourself. Combined with airdrop, max {MAX_COMBINED_ALLOCATION_PERCENT}%.
        </p>
      </div>

      <div className="space-y-4">
        <div className="text-center">
          <span className="text-4xl font-bold font-mono text-accent">
            {formData.creatorAllocationPercent}%
          </span>
          <p className="text-sm text-text-muted mt-1">
            {formData.creatorAllocationPercent === 0
              ? 'No creator allocation — 100% fair launch'
              : `${(formData.creatorAllocationPercent * 10_000_000).toLocaleString()} tokens reserved`}
          </p>
        </div>

        <Slider.Root
          value={[formData.creatorAllocationPercent]}
          onValueChange={([v]) => updateForm({ creatorAllocationPercent: v })}
          max={maxCreator}
          step={0.5}
          className="relative flex items-center select-none touch-none w-full h-5"
        >
          <Slider.Track className="bg-input relative grow rounded-full h-2">
            <Slider.Range className="absolute bg-accent rounded-full h-full" />
          </Slider.Track>
          <Slider.Thumb className="block w-5 h-5 bg-accent rounded-full shadow-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </Slider.Root>

        <div className="flex justify-between text-xs text-text-muted">
          <span>0% (Fair Launch)</span>
          <span>{maxCreator}% (Max)</span>
        </div>
      </div>

      {/* Supply breakdown */}
      <div className="p-3 rounded-lg bg-elevated space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Supply Breakdown</p>
        <div className="flex gap-2 text-xs">
          <div className="flex-1 p-2 rounded bg-input text-center">
            <span className="text-text-muted block">Creator</span>
            <span className="font-mono text-text-primary">{formData.creatorAllocationPercent}%</span>
          </div>
          {airdropPercent > 0 && (
            <div className="flex-1 p-2 rounded bg-input text-center">
              <span className="text-text-muted block">Airdrop</span>
              <span className="font-mono text-text-primary">{airdropPercent}%</span>
            </div>
          )}
          <div className="flex-1 p-2 rounded bg-input text-center">
            <span className="text-text-muted block">Bonding Curve</span>
            <span className="font-mono text-accent">{curvePercent}%</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={prevStep} className="flex-1" size="lg">
          Back
        </Button>
        <Button onClick={nextStep} className="flex-1" size="lg">
          Next: Airdrop
        </Button>
      </div>
    </div>
  );
}

import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { AIRDROP_COMMUNITIES, MAX_COMBINED_ALLOCATION_PERCENT } from '@/config/constants';
import { cn } from '@/lib/cn';
import type { AirdropCommunity } from '@/types/launch';

const communityKeys = Object.keys(AIRDROP_COMMUNITIES) as AirdropCommunity[];

export function StepAirdrop() {
  const { formData, updateForm, nextStep, prevStep } = useLaunchStore();

  const maxAirdrop = MAX_COMBINED_ALLOCATION_PERCENT - formData.creatorAllocationPercent;
  const airdropPercent = formData.airdropEnabled ? formData.airdropPercent : 0;
  const curvePercent = 100 - formData.creatorAllocationPercent - airdropPercent;

  const selectedCommunity = AIRDROP_COMMUNITIES[formData.airdropCommunity];
  const totalAirdropTokens = 1_000_000_000 * (airdropPercent / 100);
  const tokensPerWallet = formData.airdropEnabled && selectedCommunity
    ? Math.floor(totalAirdropTokens / selectedCommunity.estimatedHolders)
    : 0;

  // Clamp airdrop if creator allocation increased
  if (formData.airdropPercent > maxAirdrop && formData.airdropEnabled) {
    updateForm({ airdropPercent: Math.max(0.5, maxAirdrop) });
  }

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Community Airdrop</h3>
        <p className="text-sm text-text-secondary">
          Distribute tokens to an existing Bitcoin community at launch.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-elevated">
        <span className="text-sm text-text-primary">Enable airdrop</span>
        <Switch.Root
          checked={formData.airdropEnabled}
          onCheckedChange={(checked) => updateForm({ airdropEnabled: checked })}
          className={cn(
            'w-11 h-6 rounded-full relative transition-colors',
            formData.airdropEnabled ? 'bg-accent' : 'bg-input',
          )}
        >
          <Switch.Thumb className={cn(
            'block w-5 h-5 bg-white rounded-full transition-transform',
            formData.airdropEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]',
          )} />
        </Switch.Root>
      </div>

      {formData.airdropEnabled && (
        <>
          {/* Community selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Select Community</p>
            <div className="grid grid-cols-2 gap-2">
              {communityKeys.map((key) => {
                const community = AIRDROP_COMMUNITIES[key];
                const isSelected = formData.airdropCommunity === key;
                return (
                  <button
                    key={key}
                    onClick={() => updateForm({ airdropCommunity: key })}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-colors',
                      isSelected
                        ? 'border-accent bg-accent/10'
                        : 'border-border bg-elevated hover:border-text-muted',
                    )}
                  >
                    <p className={cn(
                      'text-sm font-semibold',
                      isSelected ? 'text-accent' : 'text-text-primary',
                    )}>
                      {community.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase',
                        community.type === 'ordinals'
                          ? 'bg-orange-500/10 text-orange-400'
                          : 'bg-blue-500/10 text-blue-400',
                      )}>
                        {community.type === 'ordinals' ? 'Ordinals' : 'OP20'}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        ~{community.estimatedHolders.toLocaleString()} holders
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Percentage slider */}
          <div className="space-y-4">
            <div className="text-center">
              <span className="text-4xl font-bold font-mono text-accent">
                {formData.airdropPercent}%
              </span>
              {tokensPerWallet > 0 && (
                <p className="text-sm text-text-muted mt-1">
                  = <span className="font-mono text-text-primary">{tokensPerWallet.toLocaleString()}</span> tokens per wallet
                </p>
              )}
            </div>

            <Slider.Root
              value={[formData.airdropPercent]}
              onValueChange={([v]) => updateForm({ airdropPercent: v })}
              min={0.5}
              max={maxAirdrop}
              step={0.5}
              className="relative flex items-center select-none touch-none w-full h-5"
            >
              <Slider.Track className="bg-input relative grow rounded-full h-2">
                <Slider.Range className="absolute bg-accent rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb className="block w-5 h-5 bg-accent rounded-full shadow-md hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent/50" />
            </Slider.Root>

            <div className="flex justify-between text-xs text-text-muted">
              <span>0.5%</span>
              <span>{maxAirdrop}% (Max)</span>
            </div>
          </div>

          {/* Supply breakdown */}
          <div className="p-3 rounded-lg bg-elevated space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Supply Breakdown</p>
            <div className="flex gap-2 text-xs">
              {formData.creatorAllocationPercent > 0 && (
                <div className="flex-1 p-2 rounded bg-input text-center">
                  <span className="text-text-muted block">Creator</span>
                  <span className="font-mono text-text-primary">{formData.creatorAllocationPercent}%</span>
                </div>
              )}
              <div className="flex-1 p-2 rounded bg-input text-center">
                <span className="text-text-muted block">Airdrop</span>
                <span className="font-mono text-text-primary">{airdropPercent}%</span>
              </div>
              <div className="flex-1 p-2 rounded bg-input text-center">
                <span className="text-text-muted block">Bonding Curve</span>
                <span className="font-mono text-accent">{curvePercent}%</span>
              </div>
            </div>
          </div>

          {/* Info note */}
          <p className="text-xs text-text-muted">
            Airdrop tokens will be minted to your wallet for distribution to {selectedCommunity.name} holders.
          </p>
        </>
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

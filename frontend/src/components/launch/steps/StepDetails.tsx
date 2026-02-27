import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';

export function StepDetails() {
  const { formData, updateForm, nextStep } = useLaunchStore();

  const canProceed = formData.name.length >= 2 && formData.symbol.length >= 2 && formData.description.length >= 10;

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Token Details</h3>
        <p className="text-sm text-text-secondary">Name, symbol, and description for your token.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Token Name</label>
          <Input
            placeholder="e.g. Bitcoin Pizza"
            value={formData.name}
            onChange={(e) => updateForm({ name: e.target.value })}
            maxLength={32}
          />
        </div>

        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Symbol</label>
          <Input
            placeholder="e.g. PIZZA"
            value={formData.symbol}
            onChange={(e) => updateForm({ symbol: e.target.value.toUpperCase() })}
            maxLength={8}
          />
        </div>

        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Description</label>
          <textarea
            className="w-full h-24 px-3 py-2 rounded-lg bg-input border border-border text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            placeholder="What makes your token special?"
            value={formData.description}
            onChange={(e) => updateForm({ description: e.target.value })}
            maxLength={500}
          />
          <p className="text-xs text-text-muted mt-1">{formData.description.length}/500</p>
        </div>

        <div>
          <label className="text-sm text-text-secondary mb-1.5 block">Token Image</label>
          <div className="w-20 h-20 rounded-xl bg-elevated border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-accent/50 transition-colors">
            {formData.image ? (
              <span className="text-3xl">{formData.image}</span>
            ) : (
              <span className="text-text-muted text-xs text-center px-1">Click to upload</span>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {['🚀', '🔥', '💎', '🐕', '🌙', '⚡'].map((emoji) => (
              <button
                key={emoji}
                onClick={() => updateForm({ image: emoji })}
                className="w-8 h-8 rounded bg-elevated hover:bg-input text-lg flex items-center justify-center"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Button onClick={nextStep} disabled={!canProceed} className="w-full" size="lg">
        Next: Socials
      </Button>
    </div>
  );
}

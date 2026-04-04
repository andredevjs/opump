import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { normalizeWebsiteInput, normalizeHandleInput } from '@/lib/url';
import type { Platform } from '@/lib/url';
import { Globe, Twitter, Send, MessageCircle, Github } from 'lucide-react';
import { cn } from '@/lib/cn';

const HANDLE_FIELDS = [
  { icon: Twitter, label: 'Twitter', key: 'twitter' as const, prefix: 'x.com/', placeholder: 'handle' },
  { icon: Send, label: 'Telegram', key: 'telegram' as const, prefix: 't.me/', placeholder: 'group' },
  { icon: MessageCircle, label: 'Discord', key: 'discord' as const, prefix: 'discord.gg/', placeholder: 'invite' },
  { icon: Github, label: 'GitHub', key: 'github' as const, prefix: 'github.com/', placeholder: 'org/repo' },
] as const;

const HANDLE_ERROR_MESSAGES: Record<string, (prefix: string) => string> = {
  unsupported_url: (prefix) => `Enter a handle or a ${prefix} URL`,
  unsupported_scheme: () => 'Only https:// URLs are accepted',
  invalid_handle: () => 'Invalid handle',
};

const WEBSITE_ERROR_MESSAGES: Record<string, string> = {
  unsupported_scheme: 'Only http:// or https:// websites are accepted',
  invalid_url: 'Invalid URL',
};

export function StepSocials() {
  const { formData, updateForm, nextStep, prevStep } = useLaunchStore();
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  function handleBlur(key: Platform) {
    const raw = formData[key];
    if (!raw.trim()) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
      return;
    }
    const result = normalizeHandleInput(key, raw);
    if (!result.ok) {
      const prefix = HANDLE_FIELDS.find((f) => f.key === key)!.prefix;
      setErrors((prev) => ({ ...prev, [key]: HANDLE_ERROR_MESSAGES[result.reason](prefix) }));
      return;
    }
    if (result.stored !== raw) updateForm({ [key]: result.stored });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleWebsiteBlur() {
    const raw = formData.website;
    if (!raw.trim()) {
      setErrors((prev) => ({ ...prev, website: undefined }));
      return;
    }
    const result = normalizeWebsiteInput(raw);
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, website: WEBSITE_ERROR_MESSAGES[result.reason] }));
      return;
    }
    if (result.stored !== raw) updateForm({ website: result.stored });
    setErrors((prev) => ({ ...prev, website: undefined }));
  }

  function handleNext() {
    const newErrors: Partial<Record<string, string>> = {};
    let hasError = false;

    const websiteResult = normalizeWebsiteInput(formData.website);
    if (!websiteResult.ok) {
      newErrors.website = WEBSITE_ERROR_MESSAGES[websiteResult.reason];
      hasError = true;
    }

    for (const field of HANDLE_FIELDS) {
      const result = normalizeHandleInput(field.key, formData[field.key]);
      if (!result.ok) {
        newErrors[field.key] = HANDLE_ERROR_MESSAGES[result.reason](field.prefix);
        hasError = true;
      }
    }

    setErrors(newErrors);
    if (!hasError) nextStep();
  }

  function clearError(key: string) {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Social Links</h3>
        <p className="text-sm text-text-secondary">Optional — add your community links.</p>
      </div>

      <div className="space-y-4">
        {/* Website — full URL input */}
        <div>
          <div className="flex items-center gap-3">
            <Globe size={18} className="text-text-muted shrink-0" />
            <input
              placeholder="https://example.com"
              value={formData.website}
              onChange={(e) => { updateForm({ website: e.target.value }); clearError('website'); }}
              onBlur={handleWebsiteBlur}
              className={cn(
                'w-full h-10 px-3 rounded-lg bg-input border text-text-primary text-sm',
                'placeholder:text-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
                'transition-colors',
                errors.website ? 'border-bear' : 'border-border',
              )}
            />
          </div>
          {errors.website && <p className="text-xs text-bear mt-1 ml-8">{errors.website}</p>}
        </div>

        {/* Handle-based fields with visual prefix */}
        {HANDLE_FIELDS.map(({ icon: Icon, key, prefix, placeholder }) => (
          <div key={key}>
            <div className="flex items-center gap-3">
              <Icon size={18} className="text-text-muted shrink-0" />
              <div
                className={cn(
                  'flex items-center w-full rounded-lg bg-input border overflow-hidden',
                  'focus-within:ring-2 focus-within:ring-accent/50 focus-within:border-accent',
                  'transition-colors',
                  errors[key] ? 'border-bear' : 'border-border',
                )}
              >
                <span className="pl-3 text-sm text-text-muted select-none whitespace-nowrap">{prefix}</span>
                <input
                  placeholder={placeholder}
                  value={formData[key]}
                  onChange={(e) => { updateForm({ [key]: e.target.value }); clearError(key); }}
                  onBlur={() => handleBlur(key)}
                  className="flex-1 h-10 px-1 bg-transparent text-text-primary text-sm placeholder:text-text-muted focus:outline-none"
                />
              </div>
            </div>
            {errors[key] && <p className="text-xs text-bear mt-1 ml-8">{errors[key]}</p>}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={prevStep} className="flex-1" size="lg">
          Back
        </Button>
        <Button onClick={handleNext} className="flex-1" size="lg">
          Next: Allocation
        </Button>
      </div>
    </div>
  );
}

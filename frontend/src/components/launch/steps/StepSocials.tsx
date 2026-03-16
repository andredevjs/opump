import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useLaunchStore } from '@/stores/launch-store';
import { Globe, Twitter, Send, MessageCircle, Github } from 'lucide-react';

export function StepSocials() {
  const { formData, updateForm, nextStep, prevStep } = useLaunchStore();

  return (
    <div className="space-y-6 max-w-md mx-auto">
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-1">Social Links</h3>
        <p className="text-sm text-text-secondary">Optional — add your community links.</p>
      </div>

      <div className="space-y-4">
        {[
          { icon: Globe, label: 'Website', key: 'website' as const, placeholder: 'https://...' },
          { icon: Twitter, label: 'Twitter', key: 'twitter' as const, placeholder: '@handle' },
          { icon: Send, label: 'Telegram', key: 'telegram' as const, placeholder: 't.me/...' },
          { icon: MessageCircle, label: 'Discord', key: 'discord' as const, placeholder: 'discord.gg/...' },
          { icon: Github, label: 'GitHub', key: 'github' as const, placeholder: 'github.com/...' },
        ].map(({ icon: Icon, label, key, placeholder }) => (
          <div key={key} className="flex items-center gap-3">
            <Icon size={18} className="text-text-muted shrink-0" />
            <Input
              placeholder={placeholder}
              value={formData[key]}
              onChange={(e) => updateForm({ [key]: e.target.value })}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={prevStep} className="flex-1" size="lg">
          Back
        </Button>
        <Button onClick={nextStep} className="flex-1" size="lg">
          Next: Allocation
        </Button>
      </div>
    </div>
  );
}

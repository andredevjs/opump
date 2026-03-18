import { useEffect } from 'react';
import { LaunchWizard } from '@/components/launch/LaunchWizard';
import { useLaunchStore } from '@/stores/launch-store';

export function LaunchPage() {
  const reset = useLaunchStore((s) => s.reset);

  useEffect(() => {
    reset();
  }, [reset]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-text-primary">Launch Your Token</h1>
        <p className="text-text-secondary mt-2">
          Deploy a bonding curve token on Bitcoin L1 in minutes.
        </p>
      </div>
      <LaunchWizard />
    </div>
  );
}

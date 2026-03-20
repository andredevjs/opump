import { useState, useEffect } from 'react';
import { Gift } from 'lucide-react';
import { useWalletStore } from '@/stores/wallet-store';
import { Button } from '@/components/ui/Button';

/**
 * Shows a banner when a referral code was captured but the user hasn't connected yet.
 * Disappears once wallet connects (linking happens automatically in wallet-store).
 */
export function ReferralBanner() {
  const { connected, connect } = useWalletStore();
  const [hasRef, setHasRef] = useState(false);

  useEffect(() => {
    setHasRef(!!localStorage.getItem('opump_ref'));
  }, []);

  // Hide once connected (the link will fire automatically)
  useEffect(() => {
    if (connected) setHasRef(false);
  }, [connected]);

  if (!hasRef) return null;

  return (
    <div className="bg-accent/10 border-b border-accent/20 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-accent">
          <Gift size={16} />
          <span>You were referred! Connect your wallet to activate your referral.</span>
        </div>
        <Button size="sm" variant="secondary" onClick={connect}>
          Connect
        </Button>
      </div>
    </div>
  );
}

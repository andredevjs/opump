import { useEffect, useState } from 'react';
import { Copy, Check, Users, TrendingUp, ArrowRightLeft } from 'lucide-react';
import { useWalletStore } from '@/stores/wallet-store';
import { useReferralStore } from '@/stores/referral-store';
import { useBtcPrice } from '@/stores/btc-price-store';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { formatUsd } from '@/lib/format';

export function ReferralDashboard() {
  const { connected, opAddress, connect } = useWalletStore();
  const { code, earnings, referredBy, loading, fetchReferralInfo } = useReferralStore();
  const { btcPrice } = useBtcPrice();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (connected && opAddress) {
      fetchReferralInfo(opAddress);
    }
  }, [connected, opAddress, fetchReferralInfo]);

  if (!connected) {
    return (
      <Card className="text-center py-12">
        <Users size={32} className="mx-auto text-text-muted mb-4" />
        <h2 className="text-lg font-semibold text-text-primary mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-text-secondary mb-4">Connect your wallet to view your referral info.</p>
        <Button onClick={connect}>Connect Wallet</Button>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!code) {
    return (
      <Card className="text-center py-12">
        <Users size={32} className="mx-auto text-text-muted mb-4" />
        <h2 className="text-lg font-semibold text-text-primary mb-2">No Referral Code</h2>
        <p className="text-sm text-text-secondary">Your wallet does not have a referral code assigned.</p>
      </Card>
    );
  }

  const shareLink = `${window.location.origin}/?ref=${code}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const totalSats = Number(earnings?.totalSats || '0');

  return (
    <div className="space-y-6">
      {/* Referral Code Card */}
      <Card className="p-6">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Your Referral Code</h3>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl font-bold font-mono text-accent tracking-widest">{code}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={shareLink}
            className="flex-1 bg-input border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-secondary"
          />
          <Button size="sm" variant="secondary" onClick={handleCopy} className="shrink-0">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="text-center py-4">
          <TrendingUp size={20} className="mx-auto text-accent mb-2" />
          <p className="text-xs text-text-muted">Total Earnings</p>
          <p className="text-lg font-bold font-mono text-text-primary">
            {totalSats.toLocaleString()} sats
          </p>
          {btcPrice > 0 && (
            <p className="text-xs text-text-secondary">{formatUsd(totalSats, btcPrice)}</p>
          )}
        </Card>
        <Card className="text-center py-4">
          <Users size={20} className="mx-auto text-accent mb-2" />
          <p className="text-xs text-text-muted">Referred Users</p>
          <p className="text-lg font-bold font-mono text-text-primary">
            {earnings?.referralCount ?? 0}
          </p>
        </Card>
        <Card className="text-center py-4">
          <ArrowRightLeft size={20} className="mx-auto text-accent mb-2" />
          <p className="text-xs text-text-muted">Trades by Referrals</p>
          <p className="text-lg font-bold font-mono text-text-primary">
            {earnings?.tradeCount ?? 0}
          </p>
        </Card>
      </div>

      {/* Referred by */}
      {referredBy && (
        <Card className="p-4">
          <p className="text-xs text-text-muted mb-1">You were referred by</p>
          <AddressDisplay address={referredBy} showCopy />
        </Card>
      )}
    </div>
  );
}

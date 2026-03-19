import { Card } from '@/components/ui/Card';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import type { CreatorProfile } from '@/types/api';
import { formatUsd, formatNumber, timeAgo } from '@/lib/format';
import { useBtcPrice } from '@/stores/btc-price-store';
import { User, Calendar, BarChart3, Coins } from 'lucide-react';

interface ProfileHeaderProps {
  profile: CreatorProfile;
}

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const { btcPrice } = useBtcPrice();

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
          <User size={28} className="text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">{profile.displayName}</h1>
          <AddressDisplay address={profile.address} showCopy showLink />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-elevated">
          <Coins size={18} className="text-accent" />
          <div>
            <p className="text-xs text-text-muted">Tokens Launched</p>
            <p className="font-mono font-semibold text-text-primary">{formatNumber(profile.tokensLaunched)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-elevated">
          <BarChart3 size={18} className="text-accent" />
          <div>
            <p className="text-xs text-text-muted">Total Volume</p>
            <p className="font-mono font-semibold text-text-primary">{formatUsd(profile.totalVolumeSats, btcPrice)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-elevated">
          <Calendar size={18} className="text-accent" />
          <div>
            <p className="text-xs text-text-muted">Joined</p>
            <p className="font-mono font-semibold text-text-primary">{timeAgo(profile.joinedAt)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

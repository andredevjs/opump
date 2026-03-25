import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { CreatedTokens } from '@/components/profile/CreatedTokens';
import { Holdings } from '@/components/profile/Holdings';
import { CreatorEarnings } from '@/components/profile/CreatorEarnings';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useWalletStore } from '@/stores/wallet-store';
import * as api from '@/services/api';
import type { Token } from '@/types/token';
import type { CreatorProfile } from '@/types/api';
import { mapApiTokenToToken } from '@/lib/mappers';
import { shortenAddress } from '@/lib/format';

const PROFILE_POLL_INTERVAL_MS = 20_000;

export function ProfilePage() {
  const { address } = useParams<{ address: string }>();
  const { connected, address: walletAddress } = useWalletStore();
  const [createdTokens, setCreatedTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('created');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const isOwnProfile = connected && walletAddress === address;
  const showEarnings = isOwnProfile && createdTokens.length > 0;

  // Reset loading when address changes (render-time adjustment, avoids synchronous setState in effect)
  const [prevAddress, setPrevAddress] = useState(address);
  if (address !== prevAddress) {
    setPrevAddress(address);
    setLoading(true);
  }

  // Reset to "created" tab if earnings tab becomes unavailable (render-time adjustment)
  if (activeTab === 'earnings' && !showEarnings) {
    setActiveTab('created');
  }

  const fetchProfile = useCallback(() => {
    if (!address) return;
    api.getProfileTokens(address).then((res) => {
      setCreatedTokens(res.tokens.map(mapApiTokenToToken));
    }).catch(() => {
      // Keep existing on error
    });
  }, [address]);

  useEffect(() => {
    if (!address) return;

    api.getProfileTokens(address).then((res) => {
      setCreatedTokens(res.tokens.map(mapApiTokenToToken));
    }).catch(() => {
      // Keep empty on error
    }).finally(() => {
      setLoading(false);
    });

    // T029: Poll every 20s to keep profile data fresh
    intervalRef.current = setInterval(fetchProfile, PROFILE_POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [address, fetchProfile]);

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-text-muted">
        <p>Invalid address.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const profile: CreatorProfile = {
    address,
    displayName: shortenAddress(address, 6),
    tokensLaunched: createdTokens.length,
    totalVolumeSats: createdTokens.reduce((sum, t) => sum + t.volume24hSats, 0),
    joinedAt: createdTokens.length > 0 ? Math.min(...createdTokens.map(t => t.createdAt)) : 0,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <ProfileHeader profile={profile} />

      <Card>
        <TabsRoot value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="created">Created OP20 Tokens ({createdTokens.length})</TabsTrigger>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
            {showEarnings && <TabsTrigger value="earnings">Earnings</TabsTrigger>}
          </TabsList>

          <TabsContent value="created">
            <CreatedTokens tokens={createdTokens} />
          </TabsContent>

          <TabsContent value="holdings">
            <Holdings />
          </TabsContent>

          {showEarnings && (
            <TabsContent value="earnings">
              <CreatorEarnings tokens={createdTokens} />
            </TabsContent>
          )}
        </TabsRoot>
      </Card>
    </div>
  );
}

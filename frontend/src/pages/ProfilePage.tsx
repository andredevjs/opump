import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { CreatedTokens } from '@/components/profile/CreatedTokens';
import { Holdings } from '@/components/profile/Holdings';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import * as api from '@/services/api';
import type { Token } from '@/types/token';
import type { CreatorProfile } from '@/types/api';
import { mapApiTokenToToken } from '@/lib/mappers';
import { shortenAddress } from '@/lib/format';

export function ProfilePage() {
  const { address } = useParams<{ address: string }>();
  const [createdTokens, setCreatedTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;

    setLoading(true);
    api.getProfileTokens(address).then((res) => {
      setCreatedTokens(res.tokens.map(mapApiTokenToToken));
    }).catch(() => {
      // Keep empty on error
    }).finally(() => {
      setLoading(false);
    });
  }, [address]);

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
    joinedAt: createdTokens.length > 0 ? Math.min(...createdTokens.map(t => t.createdAt)) : Date.now(),
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <ProfileHeader profile={profile} />

      <Card>
        <TabsRoot defaultValue="created">
          <TabsList>
            <TabsTrigger value="created">Created Tokens ({createdTokens.length})</TabsTrigger>
            <TabsTrigger value="holdings">Holdings</TabsTrigger>
          </TabsList>

          <TabsContent value="created">
            <CreatedTokens tokens={createdTokens} />
          </TabsContent>

          <TabsContent value="holdings">
            <Holdings />
          </TabsContent>
        </TabsRoot>
      </Card>
    </div>
  );
}

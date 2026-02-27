import { useParams } from 'react-router-dom';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { CreatedTokens } from '@/components/profile/CreatedTokens';
import { Holdings } from '@/components/profile/Holdings';
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Card } from '@/components/ui/Card';
import { getCreatorProfile, getCreatorTokens } from '@/mock/profiles';

export function ProfilePage() {
  const { address } = useParams<{ address: string }>();

  if (!address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 text-center text-text-muted">
        <p>Invalid address.</p>
      </div>
    );
  }

  const profile = getCreatorProfile(address);
  const createdTokens = getCreatorTokens(address);

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

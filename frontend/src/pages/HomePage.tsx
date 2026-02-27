import { Hero } from '@/components/home/Hero';
import { PlatformStats } from '@/components/home/PlatformStats';
import { HowItWorks } from '@/components/home/HowItWorks';
import { TopTokens } from '@/components/home/TopTokens';
import { RecentTokens } from '@/components/home/RecentTokens';

export function HomePage() {
  return (
    <div>
      <Hero />
      <PlatformStats />
      <TopTokens />
      <RecentTokens />
      <HowItWorks />
    </div>
  );
}

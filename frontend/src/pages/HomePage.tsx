import { Hero } from '@/components/home/Hero';
import { PlatformStats } from '@/components/home/PlatformStats';
import { HowItWorks } from '@/components/home/HowItWorks';
import { FeeTransparency } from '@/components/home/FeeTransparency';
import { TopTokens } from '@/components/home/TopTokens';
import { RecentTokens } from '@/components/home/RecentTokens';

export function HomePage() {
  return (
    <div>
      {/* Video background covers hero + stats */}
      <div className="relative overflow-hidden">
        <video
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ filter: 'blur(8px) brightness(0.35)', transform: 'scale(1.1)' }}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
        >
          <source src="/bg-video.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-grain" />

        <div className="relative">
          <Hero />
          <PlatformStats />
        </div>
      </div>

      <TopTokens />
      <RecentTokens />
      <HowItWorks />
      <FeeTransparency />
    </div>
  );
}

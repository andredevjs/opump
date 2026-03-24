import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { ReferralBanner } from '@/components/referral/ReferralBanner';
import { useGlobalFeed } from '@/hooks/use-global-feed';
import { useBtcPriceStore } from '@/stores/btc-price-store';
import { useReferralCapture } from '@/hooks/use-referral-capture';

export function RootLayout() {
  // Capture ?ref=CODE from URL on page load
  useReferralCapture();

  // Subscribe to global platform events via polling (new tokens, stats, status changes)
  useGlobalFeed();

  // Start BTC/USD price polling for USD display across the app
  const startPolling = useBtcPriceStore((s) => s.startPolling);
  useEffect(() => startPolling(), [startPolling]);

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Fixed video background — site-wide */}
      <video
        className="fixed inset-0 w-full h-full object-cover pointer-events-none -z-20"
        style={{ filter: 'blur(8px) brightness(0.3)', transform: 'scale(1.1)' }}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden="true"
      >
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>
      {/* Grain texture overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.04] bg-grain -z-10" />

      <ReferralBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

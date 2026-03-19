import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useGlobalFeed } from '@/hooks/use-global-feed';
import { useBtcPriceStore } from '@/stores/btc-price-store';

export function RootLayout() {
  // Subscribe to global platform events via polling (new tokens, stats, status changes)
  useGlobalFeed();

  // Start BTC/USD price polling for USD display across the app
  const startPolling = useBtcPriceStore((s) => s.startPolling);
  useEffect(() => startPolling(), [startPolling]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

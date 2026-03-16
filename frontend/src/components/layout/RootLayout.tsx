import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { useGlobalFeed } from '@/hooks/use-global-feed';

export function RootLayout() {
  // Subscribe to global platform events via polling (new tokens, stats, status changes)
  useGlobalFeed();

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

import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { wsClient } from '@/services/websocket';
import { useGlobalFeed } from '@/hooks/use-global-feed';

export function RootLayout() {
  // Connect WebSocket at app root level — active on all pages
  useEffect(() => {
    wsClient.connect();
  }, []);

  // Subscribe to global platform events (new_token, token_activity, platform_stats_update, etc.)
  useGlobalFeed();

  return (
    <div className="min-h-screen flex flex-col">
      <ConnectionStatus />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { wsClient } from '@/services/websocket';

export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [wsConnected, setWsConnected] = useState(wsClient.isConnected());

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    return wsClient.onConnectionChange(setWsConnected);
  }, []);

  if (!online) {
    return (
      <Banner variant="error">
        You are offline. Check your internet connection.
      </Banner>
    );
  }

  if (!wsConnected && wsClient.hasAttemptedConnection()) {
    return (
      <Banner variant="warning">
        Live updates unavailable — reconnecting...
      </Banner>
    );
  }

  return null;
}

function Banner({
  variant,
  children,
}: {
  variant: 'warning' | 'error';
  children: React.ReactNode;
}) {
  const bg =
    variant === 'error'
      ? 'bg-red-900/80 border-red-700'
      : 'bg-yellow-900/80 border-yellow-700';
  const dot =
    variant === 'error' ? 'bg-red-400' : 'bg-yellow-400';

  return (
    <div
      className={`${bg} border-b px-4 py-2 text-center text-sm text-white flex items-center justify-center gap-2`}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dot} animate-pulse`} />
      {children}
    </div>
  );
}

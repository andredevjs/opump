import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';

export function RootLayout() {
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

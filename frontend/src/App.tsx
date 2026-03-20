import { createBrowserRouter, RouterProvider, useRouteError } from 'react-router-dom';
import { RootLayout } from '@/components/layout/RootLayout';
import { HomePage } from '@/pages/HomePage';
import { LaunchPage } from '@/pages/LaunchPage';
import { FieldsPage } from '@/pages/FieldsPage';
import { TokenPage } from '@/pages/TokenPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { ReferralPage } from '@/pages/ReferralPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

function RouteErrorFallback() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a12] px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">!</div>
        <h1 className="text-2xl font-bold text-white">Page Error</h1>
        <p className="text-sm text-gray-400">{message}</p>
        <div className="flex gap-3 justify-center">
          <a
            href="/"
            className="px-4 py-2 text-sm rounded-lg bg-[#1a1a2e] border border-[#2a2a3d] text-gray-300 hover:bg-[#2a2a3d] transition-colors"
          >
            Go home
          </a>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm rounded-lg bg-accent text-black hover:bg-accent-hover transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/launch', element: <LaunchPage /> },
      { path: '/fields', element: <FieldsPage /> },
      { path: '/token/:address', element: <TokenPage /> },
      { path: '/profile/:address', element: <ProfilePage /> },
      { path: '/referral', element: <ReferralPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

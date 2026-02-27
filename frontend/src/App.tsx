import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from '@/components/layout/RootLayout';
import { HomePage } from '@/pages/HomePage';
import { LaunchPage } from '@/pages/LaunchPage';
import { TrenchesPage } from '@/pages/TrenchesPage';
import { TokenPage } from '@/pages/TokenPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/launch', element: <LaunchPage /> },
      { path: '/trenches', element: <TrenchesPage /> },
      { path: '/token/:address', element: <TokenPage /> },
      { path: '/profile/:address', element: <ProfilePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}

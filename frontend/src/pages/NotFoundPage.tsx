import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="text-6xl mb-6">🟠</div>
      <h1 className="text-4xl font-bold text-text-primary mb-2">404</h1>
      <p className="text-text-secondary mb-6">
        This page doesn't exist. Maybe it hasn't been mined yet.
      </p>
      <Link to="/">
        <Button>
          <Home size={16} className="mr-2" />
          Back to Home
        </Button>
      </Link>
    </div>
  );
}

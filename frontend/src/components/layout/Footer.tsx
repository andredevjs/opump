import { Link } from 'react-router-dom';
import cornhubLogo from '@/assets/brand/cornhub-logo-transparent.png';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={cornhubLogo} alt="CornHub" className="h-6" />
            <span className="text-sm text-text-secondary">
              — Bitcoin-native token launchpad on OPNet
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <Link to="/" className="hover:text-text-secondary transition-colors">Home</Link>
            <Link to="/launch" className="hover:text-text-secondary transition-colors">Launch</Link>
            <Link to="/fields" className="hover:text-text-secondary transition-colors">Fields</Link>
            <span>Built on Bitcoin L1 via Op_Net</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { WalletButton } from './WalletButton';
import { useUIStore } from '@/stores/ui-store';
import { useWalletStore } from '@/stores/wallet-store';
import { cn } from '@/lib/cn';
import cornhubFieldsLogo from '@/assets/brand/cornhub-fields-full.webp';

const NAV_LINKS = [
  { label: 'Home', path: '/' },
  { label: 'Launch', path: '/launch' },
  { label: 'Fields', path: '/fields' },
  { label: 'Referrals', path: '/referral' },
];

export function Header() {
  const location = useLocation();
  const { mobileMenuOpen, toggleMobileMenu, closeMobileMenu } = useUIStore();
  const address = useWalletStore((s) => s.address);
  const portfolioPath = address ? `/profile/${address}` : null;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2" onClick={closeMobileMenu}>
            <img src={cornhubFieldsLogo} alt="CornHub Fields" className="h-10" width={143} height={100} />
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === link.path
                    ? 'text-accent bg-accent/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated',
                )}
              >
                {link.label}
              </Link>
            ))}
            {portfolioPath && (
              <Link
                to={portfolioPath}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === portfolioPath
                    ? 'text-accent bg-accent/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated',
                )}
              >
                Portfolio
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <WalletButton />
          <button
            className="md:hidden text-text-secondary hover:text-text-primary"
            onClick={toggleMobileMenu}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-card">
          <nav className="flex flex-col p-4 gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={closeMobileMenu}
                className={cn(
                  'px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === link.path
                    ? 'text-accent bg-accent/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated',
                )}
              >
                {link.label}
              </Link>
            ))}
            {portfolioPath && (
              <Link
                to={portfolioPath}
                onClick={closeMobileMenu}
                className={cn(
                  'px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === portfolioPath
                    ? 'text-accent bg-accent/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated',
                )}
              >
                Portfolio
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

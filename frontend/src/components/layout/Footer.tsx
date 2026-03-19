import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-border bg-card mt-auto">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🟠</span>
            <span className="text-sm text-text-secondary">
              O<span className="text-accent font-semibold">Pump</span> — Bitcoin-native token launchpad on OPNet
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <Link to="/" className="hover:text-text-secondary transition-colors">Home</Link>
            <Link to="/launch" className="hover:text-text-secondary transition-colors">Launch</Link>
            <Link to="/trenches" className="hover:text-text-secondary transition-colors">Trenches</Link>
            <span>Built on Bitcoin L1 via Op_Net</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rocket, TrendingUp } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-4xl mx-auto text-center px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          Live on Bitcoin L1
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold text-text-primary mb-4 leading-tight">
          Launch OP20 Tokens on{' '}
          <span className="text-accent">Bitcoin</span>
        </h1>
        <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-8">
          The Bitcoin-native token launchpad. Fair launches, bonding curve trading,
          and automatic DEX graduation — all on Bitcoin L1.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link to="/launch">
            <Button size="lg">
              <Rocket size={18} className="mr-2" />
              Launch OP20 Token
            </Button>
          </Link>
          <Link to="/trenches">
            <Button variant="secondary" size="lg">
              <TrendingUp size={18} className="mr-2" />
              Explore OP20 Tokens
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

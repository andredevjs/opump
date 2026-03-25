import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Rocket, TrendingUp } from 'lucide-react';
import cornhubFieldsLogo from '@/assets/brand/cornhub-fields-full.webp';

export function Hero() {
  return (
    <section className="pt-10 sm:pt-16 pb-16 sm:pb-20">
      <div className="max-w-4xl mx-auto text-center px-4">
        <img
          src={cornhubFieldsLogo}
          alt="CornHub Fields"
          className="mx-auto mb-6 max-w-lg w-full"
          width={1280}
          height={633}
        />

        <h1 className="text-4xl sm:text-6xl font-bold text-text-primary mb-4 leading-tight">
          Launch OP20 Tokens on{' '}
          <span className="text-accent">Bitcoin</span>
        </h1>
        <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-8">
          The Bitcoin-native token launchpad. Fair launches, bonding curve trading,
          and automatic DEX graduation — all on Bitcoin L1 via Op_Net.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link to="/launch">
            <Button size="lg">
              <Rocket size={18} className="mr-2" />
              Launch OP20 Token
            </Button>
          </Link>
          <Link to="/fields">
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

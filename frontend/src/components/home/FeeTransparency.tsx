import { Shield, Percent, User } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import {
  TOTAL_FEE_PERCENT,
  PLATFORM_FEE_PERCENT,
  CREATOR_FEE_PERCENT,
} from '@/config/constants';

const FEES = [
  {
    icon: Shield,
    label: 'Platform',
    percent: PLATFORM_FEE_PERCENT,
    description: 'Maintains infrastructure, indexers, development, ecosystem incentives, buybacks, listings, and marketing.',
  },
  {
    icon: User,
    label: 'Token Creator',
    percent: CREATOR_FEE_PERCENT,
    description: 'Rewards the creator on every trade of their token.',
  },
];

export function FeeTransparency() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-text-primary mb-2">Transparent Fees</h2>
        <p className="text-text-secondary text-sm max-w-lg mx-auto">
          Every trade has a flat{' '}
          <span className="text-accent font-semibold">{TOTAL_FEE_PERCENT}%</span> fee.
          No hidden costs — here's exactly where it goes.
        </p>
      </div>

      {/* Total bar */}
      <div className="max-w-2xl mx-auto mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Percent size={14} className="text-accent" />
          <span className="text-xs font-mono text-text-secondary">Fee distribution</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex bg-surface">
          <div
            className="bg-accent"
            style={{ width: `${(PLATFORM_FEE_PERCENT / TOTAL_FEE_PERCENT) * 100}%` }}
          />
          <div
            className="bg-green-500"
            style={{ width: `${(CREATOR_FEE_PERCENT / TOTAL_FEE_PERCENT) * 100}%` }}
          />
        </div>
      </div>

      {/* Fee cards */}
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {FEES.map((fee) => (
          <Card key={fee.label} className="text-center p-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 text-accent mb-4">
              <fee.icon size={28} />
            </div>
            <div className="text-2xl font-bold text-text-primary font-mono mb-1">
              {fee.percent}%
            </div>
            <h3 className="text-sm font-semibold text-text-primary mb-2">{fee.label}</h3>
            <p className="text-xs text-text-secondary leading-relaxed">{fee.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

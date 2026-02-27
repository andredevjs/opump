import { Rocket, TrendingUp, Award } from 'lucide-react';
import { Card } from '@/components/ui/Card';

const STEPS = [
  {
    icon: Rocket,
    title: 'Launch',
    description: 'Create a token in 6 steps. No liquidity needed — the bonding curve is the market maker from block one.',
  },
  {
    icon: TrendingUp,
    title: 'Trade',
    description: 'Buy and sell on the bonding curve. Constant-product AMM ensures fair pricing. See trades in seconds via mempool.',
  },
  {
    icon: Award,
    title: 'Graduate',
    description: 'At 6.9M sats in real BTC reserve, the token graduates to MotoSwap DEX with automatic liquidity migration.',
  },
];

export function HowItWorks() {
  return (
    <section className="max-w-7xl mx-auto px-4 py-16">
      <h2 className="text-2xl font-bold text-text-primary text-center mb-8">How It Works</h2>
      <div className="grid md:grid-cols-3 gap-6">
        {STEPS.map((step, i) => (
          <Card key={step.title} className="text-center p-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-accent/10 text-accent mb-4">
              <step.icon size={28} />
            </div>
            <div className="text-xs text-accent font-mono mb-2">Step {i + 1}</div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">{step.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{step.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

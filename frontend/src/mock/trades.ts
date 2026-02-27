import type { Trade } from '@/types/trade';
import type { Token } from '@/types/token';
import { seededRandom } from './tokens';

const TRADER_ADDRESSES = [
  'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  'bc1q9h5yjqka3m0en7mcrj7ss2j4yse2t3cqs22y9n',
  'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  'bc1qrp33g0q5b5698ahp5jnf5yzjmgces69hsy6nt5',
  'bc1q5y7z3q9qj6hh2vpmrhcn0fl3mzy2yrx4qf0kz7',
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h',
  'bc1qa5wkgaew2dkv56kc6hp8kap4a9s65ehkc5uyex',
  'bc1qjl8uwezzlech723lpnyuza0h2cdkvxvh54v3dn',
];

function generateTxHash(seed: string): string {
  const chars = '0123456789abcdef';
  const rng = seededRandom(seed);
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(rng() * chars.length)];
  }
  return hash;
}

export function generateTradesForToken(token: Token, count = 50): Trade[] {
  const rng = seededRandom(token.address + '-trades');
  const trades: Trade[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const isBuy = rng() > 0.45; // slight buy bias
    const age = Math.floor(rng() * 86400 * 3) * 1000; // up to 3 days old
    const timestamp = now - age;

    const btcAmount = Math.floor(
      (10_000 + rng() * 500_000) *
      (token.personality === 'pumping' ? 1.5 : token.personality === 'dumping' ? 0.7 : 1)
    );
    const tokenAmount = Math.floor(btcAmount / token.currentPriceSats * (0.8 + rng() * 0.4));

    trades.push({
      id: `trade-${token.symbol}-${i}`,
      tokenAddress: token.address,
      traderAddress: TRADER_ADDRESSES[Math.floor(rng() * TRADER_ADDRESSES.length)],
      type: isBuy ? 'buy' : 'sell',
      btcAmount,
      tokenAmount,
      priceSats: token.currentPriceSats * (0.9 + rng() * 0.2),
      fee: Math.floor(btcAmount * 0.015),
      timestamp,
      status: 'confirmed',
      txHash: generateTxHash(`${token.symbol}-${i}`),
    });
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

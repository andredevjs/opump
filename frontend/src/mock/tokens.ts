import BigNumber from 'bignumber.js';
import type { Token, TokenPersonality, TokenStatus } from '@/types/token';
import { INITIAL_VIRTUAL_BTC_SATS, INITIAL_VIRTUAL_TOKEN_SUPPLY, K, GRADUATION_THRESHOLD_SATS } from '@/config/constants';
import { getCurrentPrice, getGraduationProgress } from '@/lib/bonding-curve';

// Seeded PRNG — ensures same address always generates same data
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  };
}

interface TokenSeed {
  name: string;
  symbol: string;
  description: string;
  image: string;
  personality: TokenPersonality;
  realBtcOffset: number; // sats added to base
  priceMultiplier: number;
  volume24h: number;
  change24h: number;
  holderCount: number;
  daysOld: number;
  creatorAllocation: number;
  buyTax: number;
  sellTax: number;
  website?: string;
  twitter?: string;
  telegram?: string;
}

const TOKEN_SEEDS: TokenSeed[] = [
  {
    name: 'Bitcoin Pizza', symbol: 'PIZZA', description: 'Celebrating the 10,000 BTC pizza transaction. Every slice counts.',
    image: '🍕', personality: 'pumping', realBtcOffset: 4_200_000, priceMultiplier: 1.42,
    volume24h: 12_500_000, change24h: 34.5, holderCount: 847, daysOld: 12,
    creatorAllocation: 5, buyTax: 1, sellTax: 2, website: 'https://bitcoinpizza.org', twitter: '@btcpizza',
  },
  {
    name: 'Motoshi', symbol: 'MOTOSHI', description: 'The spirit of OPNet. Community-driven, Bitcoin-native.',
    image: '⛩️', personality: 'stable', realBtcOffset: 3_100_000, priceMultiplier: 1.15,
    volume24h: 8_700_000, change24h: 2.3, holderCount: 1_243, daysOld: 28,
    creatorAllocation: 3, buyTax: 0.5, sellTax: 1, twitter: '@motoshi_btc', telegram: 't.me/motoshi',
  },
  {
    name: 'Satoshi Dog', symbol: 'SDOG', description: 'The first dog on Bitcoin. No chains, just Bitcoin.',
    image: '🐕', personality: 'pumping', realBtcOffset: 5_500_000, priceMultiplier: 1.85,
    volume24h: 18_200_000, change24h: 67.2, holderCount: 2_100, daysOld: 8,
    creatorAllocation: 2, buyTax: 0, sellTax: 0, twitter: '@satoshidog',
  },
  {
    name: 'HODL Token', symbol: 'HODL', description: 'Diamond hands only. Built for Bitcoin maxis who never sell.',
    image: '💎', personality: 'stable', realBtcOffset: 2_800_000, priceMultiplier: 1.1,
    volume24h: 5_400_000, change24h: -1.2, holderCount: 3_450, daysOld: 45,
    creatorAllocation: 0, buyTax: 0, sellTax: 3, twitter: '@hodl_btc',
  },
  {
    name: 'Block Wizard', symbol: 'WIZZ', description: 'Magic on every block. Casting spells on the Bitcoin blockchain.',
    image: '🧙', personality: 'volatile', realBtcOffset: 1_900_000, priceMultiplier: 0.95,
    volume24h: 15_300_000, change24h: -12.8, holderCount: 567, daysOld: 5,
    creatorAllocation: 8, buyTax: 2, sellTax: 3, telegram: 't.me/blockwizard',
  },
  {
    name: 'Moto Cat', symbol: 'MCAT', description: 'Official MotoCAT community token. Purring on Bitcoin L1.',
    image: '🐱', personality: 'pumping', realBtcOffset: 6_200_000, priceMultiplier: 2.1,
    volume24h: 22_000_000, change24h: 89.4, holderCount: 1_890, daysOld: 15,
    creatorAllocation: 4, buyTax: 1, sellTax: 1.5, website: 'https://motocat.xyz', twitter: '@motocats',
  },
  {
    name: 'Rune Stone', symbol: 'RUNE', description: 'Channeling ancient Bitcoin energy. Every inscription tells a story.',
    image: '🪨', personality: 'stable', realBtcOffset: 3_500_000, priceMultiplier: 1.25,
    volume24h: 7_100_000, change24h: 5.7, holderCount: 923, daysOld: 21,
    creatorAllocation: 5, buyTax: 0, sellTax: 0,
  },
  {
    name: 'Lightning Bug', symbol: 'LBUG', description: 'Fast as lightning, small as a bug. The micro-cap play.',
    image: '⚡', personality: 'new', realBtcOffset: 350_000, priceMultiplier: 0.45,
    volume24h: 1_200_000, change24h: 156.0, holderCount: 89, daysOld: 1,
    creatorAllocation: 10, buyTax: 3, sellTax: 5,
  },
  {
    name: 'Sats Stacker', symbol: 'STACK', description: 'Stack sats, stack tokens. The DCA meme coin.',
    image: '📚', personality: 'stable', realBtcOffset: 2_400_000, priceMultiplier: 1.05,
    volume24h: 4_300_000, change24h: 0.8, holderCount: 1_567, daysOld: 33,
    creatorAllocation: 2, buyTax: 0, sellTax: 1,
  },
  {
    name: 'Genesis Block', symbol: 'GEN', description: 'In the beginning, there was Bitcoin. Then there was GEN.',
    image: '🏛️', personality: 'graduated', realBtcOffset: 7_200_000, priceMultiplier: 3.2,
    volume24h: 31_000_000, change24h: 12.1, holderCount: 4_200, daysOld: 60,
    creatorAllocation: 3, buyTax: 0, sellTax: 0, website: 'https://genesisblock.btc',
  },
  {
    name: 'Moon Juice', symbol: 'MOON', description: 'Fueling rockets to the moon. One sip at a time.',
    image: '🌙', personality: 'dumping', realBtcOffset: 1_400_000, priceMultiplier: 0.65,
    volume24h: 9_800_000, change24h: -28.5, holderCount: 412, daysOld: 7,
    creatorAllocation: 7, buyTax: 2, sellTax: 4,
  },
  {
    name: 'Hash Rate', symbol: 'HASH', description: 'Backed by computational power. The miner\'s meme.',
    image: '⛏️', personality: 'stable', realBtcOffset: 2_900_000, priceMultiplier: 1.18,
    volume24h: 6_700_000, change24h: 3.4, holderCount: 789, daysOld: 18,
    creatorAllocation: 1, buyTax: 0, sellTax: 0,
  },
  {
    name: 'Wen Lambo', symbol: 'LAMBO', description: 'The eternal question answered on Bitcoin. Wen? Now.',
    image: '🏎️', personality: 'volatile', realBtcOffset: 800_000, priceMultiplier: 0.7,
    volume24h: 11_500_000, change24h: -45.2, holderCount: 234, daysOld: 3,
    creatorAllocation: 10, buyTax: 3, sellTax: 5,
  },
  {
    name: 'Cyber Hornet', symbol: 'HORNT', description: 'The Bitcoin cyber hornet meme, now a token.',
    image: '🐝', personality: 'pumping', realBtcOffset: 4_800_000, priceMultiplier: 1.65,
    volume24h: 14_200_000, change24h: 42.8, holderCount: 1_345, daysOld: 10,
    creatorAllocation: 3, buyTax: 1, sellTax: 2, twitter: '@cyberhornet_btc',
  },
  {
    name: 'Blockspace', symbol: 'BSPC', description: 'Premium blockspace is the scarcest resource. Own your piece.',
    image: '🧊', personality: 'stable', realBtcOffset: 3_300_000, priceMultiplier: 1.22,
    volume24h: 5_900_000, change24h: 1.9, holderCount: 678, daysOld: 25,
    creatorAllocation: 4, buyTax: 0, sellTax: 0,
  },
  {
    name: 'Nodl', symbol: 'NODL', description: 'Run a node. Be the network. Verify everything.',
    image: '🖥️', personality: 'new', realBtcOffset: 200_000, priceMultiplier: 0.35,
    volume24h: 800_000, change24h: 210.0, holderCount: 45, daysOld: 0,
    creatorAllocation: 5, buyTax: 1, sellTax: 2,
  },
  {
    name: 'Proof of Meme', symbol: 'MEME', description: 'The only consensus mechanism that matters.',
    image: '🃏', personality: 'volatile', realBtcOffset: 1_600_000, priceMultiplier: 0.82,
    volume24h: 13_400_000, change24h: 18.7, holderCount: 456, daysOld: 6,
    creatorAllocation: 6, buyTax: 2, sellTax: 3,
  },
  {
    name: 'Orange Pill', symbol: 'PILL', description: 'Take the orange pill. There is no going back.',
    image: '💊', personality: 'pumping', realBtcOffset: 5_100_000, priceMultiplier: 1.75,
    volume24h: 16_800_000, change24h: 55.3, holderCount: 1_678, daysOld: 14,
    creatorAllocation: 2, buyTax: 0.5, sellTax: 1, twitter: '@orangepilled',
  },
  {
    name: 'Halving', symbol: 'HALV', description: 'Celebrating every halving. Supply shock tokenized.',
    image: '✂️', personality: 'graduated', realBtcOffset: 7_500_000, priceMultiplier: 3.5,
    volume24h: 28_000_000, change24h: 8.4, holderCount: 3_890, daysOld: 55,
    creatorAllocation: 1, buyTax: 0, sellTax: 0, website: 'https://halvingtoken.io',
  },
  {
    name: 'Sat Flipper', symbol: 'FLIP', description: 'Flip sats, make stacks. The degen trader\'s token.',
    image: '🪙', personality: 'dumping', realBtcOffset: 1_100_000, priceMultiplier: 0.55,
    volume24h: 7_600_000, change24h: -35.1, holderCount: 321, daysOld: 4,
    creatorAllocation: 8, buyTax: 2, sellTax: 4,
  },
  {
    name: 'Timechain', symbol: 'TIME', description: 'Bitcoin is a timechain. This token measures epochs.',
    image: '⏰', personality: 'stable', realBtcOffset: 2_600_000, priceMultiplier: 1.08,
    volume24h: 4_900_000, change24h: -0.5, holderCount: 890, daysOld: 30,
    creatorAllocation: 3, buyTax: 0, sellTax: 1,
  },
  {
    name: 'Signal', symbol: 'SIG', description: 'Signal vs noise. Pure Bitcoin signal.',
    image: '📡', personality: 'new', realBtcOffset: 500_000, priceMultiplier: 0.5,
    volume24h: 2_100_000, change24h: 78.9, holderCount: 112, daysOld: 2,
    creatorAllocation: 5, buyTax: 1, sellTax: 2,
  },
  {
    name: 'The Dip', symbol: 'DIP', description: 'Buy the dip. Always. No exceptions.',
    image: '📉', personality: 'dumping', realBtcOffset: 900_000, priceMultiplier: 0.48,
    volume24h: 6_200_000, change24h: -52.0, holderCount: 267, daysOld: 9,
    creatorAllocation: 9, buyTax: 3, sellTax: 5,
  },
];

function generateAddress(seed: string): string {
  const chars = '0123456789abcdef';
  const rng = seededRandom(seed);
  let addr = 'bc1q';
  for (let i = 0; i < 38; i++) {
    addr += chars[Math.floor(rng() * chars.length)];
  }
  return addr;
}

function generateCreatorAddress(seed: string): string {
  return generateAddress('creator-' + seed);
}

function buildToken(seed: TokenSeed, index: number): Token {
  const address = generateAddress(seed.symbol);
  const creatorAddress = generateCreatorAddress(seed.symbol);
  const rng = seededRandom(seed.symbol);

  const realBtcReserve = seed.realBtcOffset;
  const virtualBtcReserve = INITIAL_VIRTUAL_BTC_SATS.plus(realBtcReserve);
  const virtualTokenSupply = K.div(virtualBtcReserve).integerValue();

  const price = getCurrentPrice(virtualBtcReserve, virtualTokenSupply);
  const totalSupplyUnits = INITIAL_VIRTUAL_TOKEN_SUPPLY.toNumber();

  const status: TokenStatus =
    seed.personality === 'graduated' ? 'graduated' :
    seed.personality === 'new' ? 'new' : 'active';

  const now = Date.now();
  const createdAt = now - seed.daysOld * 24 * 60 * 60 * 1000 - Math.floor(rng() * 86400000);

  return {
    address,
    name: seed.name,
    symbol: seed.symbol,
    description: seed.description,
    image: seed.image,
    creatorAddress,
    createdAt,
    virtualBtcReserve: virtualBtcReserve.toFixed(0),
    virtualTokenSupply: virtualTokenSupply.toFixed(0),
    realBtcReserve: realBtcReserve.toString(),
    currentPriceSats: price,
    marketCapSats: price * totalSupplyUnits,
    volume24hSats: seed.volume24h,
    priceChange24h: seed.change24h,
    tradeCount24h: Math.floor(seed.volume24h / 50_000 + rng() * 100),
    holderCount: seed.holderCount,
    creatorAllocationPercent: seed.creatorAllocation,
    buyTaxPercent: seed.buyTax,
    sellTaxPercent: seed.sellTax,
    website: seed.website,
    twitter: seed.twitter,
    telegram: seed.telegram,
    status,
    graduationProgress: getGraduationProgress(realBtcReserve),
    personality: seed.personality,
  };
}

export const MOCK_TOKENS: Token[] = TOKEN_SEEDS.map((seed, i) => buildToken(seed, i));

export function getTokenByAddress(address: string): Token | undefined {
  return MOCK_TOKENS.find(t => t.address === address);
}

export function getTokenBySymbol(symbol: string): Token | undefined {
  return MOCK_TOKENS.find(t => t.symbol === symbol);
}

export { seededRandom };

import type { OHLCVCandle } from '@/types/api';
import type { Token } from '@/types/token';
import { seededRandom } from './tokens';

export type TimeframeKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const TIMEFRAME_SECONDS: Record<TimeframeKey, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function generateOHLCV(
  token: Token,
  timeframe: TimeframeKey = '15m',
  count = 200,
): OHLCVCandle[] {
  const rng = seededRandom(token.address + '-ohlcv-' + timeframe);
  const candles: OHLCVCandle[] = [];
  const intervalSeconds = TIMEFRAME_SECONDS[timeframe];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - count * intervalSeconds;

  let price = token.currentPriceSats * 0.5; // start from ~50% of current

  // personality-driven trend
  const trendBias =
    token.personality === 'pumping' ? 0.003 :
    token.personality === 'dumping' ? -0.003 :
    token.personality === 'volatile' ? 0 :
    token.personality === 'graduated' ? 0.005 :
    0.0005;

  const volatility =
    token.personality === 'volatile' ? 0.06 :
    token.personality === 'pumping' ? 0.04 :
    token.personality === 'dumping' ? 0.045 :
    token.personality === 'new' ? 0.07 :
    0.025;

  for (let i = 0; i < count; i++) {
    const time = startTime + i * intervalSeconds;

    // Random walk with trend
    const change = (rng() - 0.5) * 2 * volatility + trendBias;
    price = Math.max(price * (1 + change), 0.001);

    const open = price;
    const bodySize = price * volatility * (0.2 + rng() * 0.8);
    const close = rng() > 0.5 ? open + bodySize : open - bodySize;
    const high = Math.max(open, close) + price * volatility * rng() * 0.5;
    const low = Math.max(0.001, Math.min(open, close) - price * volatility * rng() * 0.5);
    const volume = Math.floor(50_000 + rng() * 500_000 * (token.personality === 'pumping' ? 2 : 1));

    price = close;

    candles.push({
      time,
      open: parseFloat(open.toFixed(6)),
      high: parseFloat(high.toFixed(6)),
      low: parseFloat(low.toFixed(6)),
      close: parseFloat(close.toFixed(6)),
      volume,
    });
  }

  // Adjust last candle to approach current price
  if (candles.length > 0) {
    const last = candles[candles.length - 1];
    last.close = token.currentPriceSats;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
  }

  return candles;
}

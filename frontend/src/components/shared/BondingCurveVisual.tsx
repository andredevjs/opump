import { useMemo } from 'react';
import BigNumber from 'bignumber.js';
import { cn } from '@/lib/cn';
import { K, INITIAL_VIRTUAL_BTC_SATS, GRADUATION_THRESHOLD_SATS } from '@/config/constants';

interface BondingCurveVisualProps {
  virtualBtcReserve: string;
  virtualTokenSupply: string;
  realBtcReserve: string;
  className?: string;
}

export function BondingCurveVisual({
  virtualBtcReserve,
  virtualTokenSupply: _virtualTokenSupply,
  realBtcReserve: _realBtcReserve,
  className,
}: BondingCurveVisualProps) {
  const points = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const minBtc = INITIAL_VIRTUAL_BTC_SATS.toNumber();
    const maxBtc = minBtc + GRADUATION_THRESHOLD_SATS * 1.2;
    const steps = 60;

    for (let i = 0; i <= steps; i++) {
      const btc = minBtc + (maxBtc - minBtc) * (i / steps);
      const price = new BigNumber(btc).div(K.div(btc)).toNumber();
      pts.push({ x: i / steps, y: price });
    }

    const maxY = Math.max(...pts.map((p) => p.y));
    return pts.map((p) => ({ x: p.x, y: p.y / maxY }));
  }, []);

  const currentX = useMemo(() => {
    const btc = new BigNumber(virtualBtcReserve).toNumber();
    const minBtc = INITIAL_VIRTUAL_BTC_SATS.toNumber();
    const maxBtc = minBtc + GRADUATION_THRESHOLD_SATS * 1.2;
    return (btc - minBtc) / (maxBtc - minBtc);
  }, [virtualBtcReserve]);

  const w = 280;
  const h = 120;
  const pad = 8;

  const pathD = points
    .map((p, i) => {
      const x = pad + p.x * (w - pad * 2);
      const y = h - pad - p.y * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const dotX = pad + currentX * (w - pad * 2);
  const currentPoint = points.find((p) => Math.abs(p.x - currentX) < 0.02) ?? points[0];
  const dotY = h - pad - currentPoint.y * (h - pad * 2);

  return (
    <div className={cn('', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <defs>
          <linearGradient id="curve-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7931a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Fill area */}
        <path
          d={`${pathD} L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`}
          fill="url(#curve-gradient)"
        />
        {/* Curve line */}
        <path d={pathD} fill="none" stroke="#f7931a" strokeWidth="2" />
        {/* Current position dot */}
        <circle cx={dotX} cy={dotY} r="4" fill="#f7931a" />
        <circle cx={dotX} cy={dotY} r="7" fill="none" stroke="#f7931a" strokeWidth="1" opacity="0.5" />
      </svg>
    </div>
  );
}

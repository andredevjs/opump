import { useMemo } from 'react';
import BigNumber from 'bignumber.js';
import { cn } from '@/lib/cn';
import { K, INITIAL_VIRTUAL_BTC_SATS, GRADUATION_THRESHOLD_SATS, TOKEN_UNITS_PER_TOKEN, TOTAL_SUPPLY_WHOLE_TOKENS, SATS_PER_BTC } from '@/config/constants';
import { formatMcapUsd } from '@/lib/format';

interface BondingCurveVisualProps {
  virtualBtcReserve: string;
  virtualTokenSupply: string;
  realBtcReserve: string;
  btcPrice: number;
  className?: string;
}

export function BondingCurveVisual({
  virtualBtcReserve,
  virtualTokenSupply: _virtualTokenSupply,
  realBtcReserve: _realBtcReserve,
  btcPrice,
  className,
}: BondingCurveVisualProps) {
  const { points, maxMcap, graduationMcap } = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    const minBtc = INITIAL_VIRTUAL_BTC_SATS.toNumber();
    const maxBtc = minBtc + GRADUATION_THRESHOLD_SATS * 1.2;
    const steps = 60;

    for (let i = 0; i <= steps; i++) {
      const btc = minBtc + (maxBtc - minBtc) * (i / steps);
      const pricePerToken = new BigNumber(btc).times(TOKEN_UNITS_PER_TOKEN).div(K.div(btc)).toNumber();
      const mcapUsd = pricePerToken * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice;
      pts.push({ x: i / steps, y: mcapUsd });
    }

    // Graduation price
    const gradBtc = minBtc + GRADUATION_THRESHOLD_SATS;
    const gradPrice = new BigNumber(gradBtc).times(TOKEN_UNITS_PER_TOKEN).div(K.div(gradBtc)).toNumber();
    const gradMcap = gradPrice * TOTAL_SUPPLY_WHOLE_TOKENS / SATS_PER_BTC * btcPrice;

    const max = Math.max(...pts.map((p) => p.y));
    return { points: pts, maxMcap: max, graduationMcap: gradMcap };
  }, [btcPrice]);

  const currentX = useMemo(() => {
    const btc = new BigNumber(virtualBtcReserve).toNumber();
    const minBtc = INITIAL_VIRTUAL_BTC_SATS.toNumber();
    const maxBtc = minBtc + GRADUATION_THRESHOLD_SATS * 1.2;
    return (btc - minBtc) / (maxBtc - minBtc);
  }, [virtualBtcReserve]);

  const w = 320;
  const h = 120;
  const padLeft = 45;
  const padRight = 8;
  const padY = 8;

  const chartW = w - padLeft - padRight;
  const chartH = h - padY * 2;

  const pathD = points
    .map((p, i) => {
      const x = padLeft + p.x * chartW;
      const y = h - padY - (maxMcap > 0 ? (p.y / maxMcap) * chartH : 0);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const dotX = padLeft + currentX * chartW;
  const currentPoint = points.find((p) => Math.abs(p.x - currentX) < 0.02) ?? points[0];
  const dotY = h - padY - (maxMcap > 0 ? (currentPoint.y / maxMcap) * chartH : 0);

  const gradY = maxMcap > 0 ? h - padY - (graduationMcap / maxMcap) * chartH : h - padY;

  const midMcap = graduationMcap / 2;
  const midY = maxMcap > 0 ? h - padY - (midMcap / maxMcap) * chartH : h - padY;

  return (
    <div className={cn('', className)}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        <defs>
          <linearGradient id="curve-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f7931a" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#f7931a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Y-axis labels */}
        <text x={padLeft - 4} y={h - padY + 1} textAnchor="end" fill="#8888a0" fontSize="8" fontFamily="JetBrains Mono, monospace">$0</text>
        <text x={padLeft - 4} y={midY + 3} textAnchor="end" fill="#8888a0" fontSize="8" fontFamily="JetBrains Mono, monospace">{formatMcapUsd(midMcap)}</text>
        <text x={padLeft - 4} y={gradY + 3} textAnchor="end" fill="#22c55e" fontSize="8" fontFamily="JetBrains Mono, monospace">{formatMcapUsd(graduationMcap)}</text>
        {/* Graduation target line */}
        <line x1={padLeft} y1={gradY} x2={w - padRight} y2={gradY} stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
        {/* Fill area */}
        <path
          d={`${pathD} L ${w - padRight} ${h - padY} L ${padLeft} ${h - padY} Z`}
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

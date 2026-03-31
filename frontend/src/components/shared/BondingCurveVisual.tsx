import { useMemo } from 'react';
import BigNumber from 'bignumber.js';
import { cn } from '@/lib/cn';
import { GRADUATION_THRESHOLD_SATS, TOKEN_UNITS_PER_TOKEN, TOTAL_SUPPLY_WHOLE_TOKENS, SATS_PER_BTC } from '@/config/constants';
import { formatMcapUsd } from '@/lib/format';
import { safeExp } from '@/lib/exp-math';

interface BondingCurveVisualProps {
  currentSupplyOnCurve: string;
  aScaled: string;
  bScaled: string;
  realBtcReserve: string;
  btcPrice: number;
  className?: string;
}

export function BondingCurveVisual({
  currentSupplyOnCurve,
  aScaled: aScaledStr,
  bScaled: bScaledStr,
  realBtcReserve: _realBtcReserve,
  btcPrice,
  className,
}: BondingCurveVisualProps) {
  const a = useMemo(() => new BigNumber(aScaledStr).div(1e18).toNumber(), [aScaledStr]);
  const b = useMemo(() => new BigNumber(bScaledStr).div(1e18).toNumber(), [bScaledStr]);

  const { points, maxMcap, graduationMcap } = useMemo(() => {
    const pts: { x: number; y: number }[] = [];

    if (a <= 0 || b <= 0) {
      return { points: pts, maxMcap: 0, graduationMcap: 0 };
    }

    // The curve goes from supply=0 to the graduation supply.
    // Graduation supply: where accumulated cost = GRADUATION_THRESHOLD_SATS.
    // cost(0, S) = (a/b)*(e^(b*S) - 1) = threshold
    // => S = ln(b*threshold/a + 1) / b
    const gradSupplyWhole = Math.log((b * GRADUATION_THRESHOLD_SATS) / a + 1) / b;
    const maxSupplyWhole = gradSupplyWhole * 1.2; // Show 20% beyond graduation
    const steps = 60;

    for (let i = 0; i <= steps; i++) {
      const supplyWhole = maxSupplyWhole * (i / steps);
      const pricePerToken = a * safeExp(b * supplyWhole);
      const mcapUsd = (pricePerToken * TOTAL_SUPPLY_WHOLE_TOKENS) / SATS_PER_BTC * btcPrice;
      pts.push({ x: i / steps, y: mcapUsd });
    }

    // Graduation price
    const gradPrice = a * safeExp(b * gradSupplyWhole);
    const gradMcap = (gradPrice * TOTAL_SUPPLY_WHOLE_TOKENS) / SATS_PER_BTC * btcPrice;

    const max = Math.max(...pts.map((p) => p.y));
    return { points: pts, maxMcap: max, graduationMcap: gradMcap };
  }, [a, b, btcPrice]);

  const currentX = useMemo(() => {
    if (a <= 0 || b <= 0) return 0;
    const currentWhole = new BigNumber(currentSupplyOnCurve).div(TOKEN_UNITS_PER_TOKEN).toNumber();
    const gradSupplyWhole = Math.log((b * GRADUATION_THRESHOLD_SATS) / a + 1) / b;
    const maxSupplyWhole = gradSupplyWhole * 1.2;
    return maxSupplyWhole > 0 ? currentWhole / maxSupplyWhole : 0;
  }, [currentSupplyOnCurve, a, b]);

  const w = 320;
  const h = 120;
  const padLeft = 38;
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
  const dotY = currentPoint
    ? h - padY - (maxMcap > 0 ? (currentPoint.y / maxMcap) * chartH : 0)
    : h - padY;

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
        <text x={padLeft - 4} y={h - padY + 1} textAnchor="end" fill="#8888a0" fontSize="6" fontFamily="JetBrains Mono, monospace">$0</text>
        <text x={padLeft - 4} y={midY + 2} textAnchor="end" fill="#8888a0" fontSize="6" fontFamily="JetBrains Mono, monospace">{formatMcapUsd(midMcap)}</text>
        <text x={padLeft - 4} y={gradY + 2} textAnchor="end" fill="#22c55e" fontSize="6" fontFamily="JetBrains Mono, monospace">{formatMcapUsd(graduationMcap)}</text>
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

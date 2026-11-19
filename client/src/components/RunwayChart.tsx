import { motion } from 'framer-motion';
import { useI18n } from '../lib/i18n';
import { useReducedMotion } from '../lib/hooks';

export interface RunwayPoint {
  month: string;
  value: number;
}
export interface BandPoint {
  month: string;
  low: number;
  mid: number;
  high: number;
  flagged?: boolean;
}

function smooth(pts: [number, number][]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const MONTHS_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রি', 'মে', 'জুন', 'জুলা', 'আগ', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The runway chart: monthly visible inflow with a soft forecast band. Draws left to right. */
export function RunwayChart({ points, bands = [], height = 190, label, futureBand }: { points: RunwayPoint[]; bands?: BandPoint[]; height?: number; label?: string; futureBand?: BandPoint | null }) {
  const { lang, n } = useI18n();
  const reduce = useReducedMotion();
  const W = 640;
  const H = height;
  const padL = 46;
  const padR = 14;
  const padT = 12;
  const padB = 26;
  const months = [...points.map((p) => p.month)];
  if (futureBand && !months.includes(futureBand.month)) months.push(futureBand.month);
  const allBands = [...bands, ...(futureBand ? [futureBand] : [])];
  const maxV = Math.max(1, ...points.map((p) => p.value), ...allBands.map((b) => b.high)) * 1.08;
  const x = (m: string) => padL + (months.indexOf(m) / Math.max(1, months.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / maxV) * (H - padT - padB);
  const pts = points.map((p) => [x(p.month), y(p.value)] as [number, number]);
  const line = smooth(pts);
  const bandPath = allBands.length
    ? `M${allBands.map((b) => `${x(b.month)},${y(b.high)}`).join(' L')} L${[...allBands].reverse().map((b) => `${x(b.month)},${y(b.low)}`).join(' L')} Z`
    : '';
  const flagged = bands.filter((b) => b.flagged);
  const ticks = [0, 0.5, 1].map((f) => maxV * f * 0.92);
  const mlabel = (m: string) => (lang === 'bn' ? MONTHS_BN : MONTHS_EN)[Number(m.slice(5, 7)) - 1] + (m.endsWith('-01') ? ` ’${m.slice(2, 4)}` : '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label || 'Monthly visible sales'}>
      {ticks.map((tv, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} stroke="var(--line)" strokeDasharray="2 4" />
          <text x={padL - 6} y={y(tv)} textAnchor="end" dominantBaseline="central" fontSize={10} fill="var(--muted)" className="num">
            {n(Math.round(tv / 1000))}k
          </text>
        </g>
      ))}
      {bandPath && <path d={bandPath} fill="var(--accent)" opacity={0.13} />}
      {allBands.map((b) => (
        <line key={b.month} x1={x(b.month)} x2={x(b.month)} y1={y(b.high)} y2={y(b.low)} stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={1} />
      ))}
      <motion.path
        d={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.4}
        strokeLinecap="round"
        initial={{ pathLength: reduce ? 1 : 0 } as any}
        animate={{ pathLength: 1 } as any}
        transition={{ duration: reduce ? 0 : 1.1, ease: 'easeInOut' }}
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={2.4} fill="var(--accent)" />
      ))}
      {flagged.map((b) => {
        const p = points.find((pp) => pp.month === b.month);
        if (!p) return null;
        return (
          <g key={b.month}>
            <motion.circle cx={x(b.month)} cy={y(p.value)} r={5} fill="var(--notviable)" initial={{ scale: reduce ? 1 : 0.4 }} animate={{ scale: 1 }} transition={{ delay: reduce ? 0 : 1.1 }} />
            {!reduce && (
              <motion.circle cx={x(b.month)} cy={y(p.value)} r={5} fill="none" stroke="var(--notviable)" strokeWidth={2} initial={{ scale: 1, opacity: 0.9 }} animate={{ scale: 3, opacity: 0 }} transition={{ delay: 1.2, duration: 1.2 }} style={{ transformOrigin: `${x(b.month)}px ${y(p.value)}px` }} />
            )}
          </g>
        );
      })}
      {months.map((m, i) =>
        i % (months.length > 14 ? 2 : 1) === 0 ? (
          <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)">
            {mlabel(m)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

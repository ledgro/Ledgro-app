import { useEffect, useState } from 'react';

// Small SVG charts, no chart library. Every figure comes from the daily totals the app already keeps,
// so nothing here reads individual bills.

export const PALETTE = ['#60a5fa', '#818cf8', '#34d399', '#f59e0b', '#94a3b8'];

const R = 42;
const C = 2 * Math.PI * R;
const STROKE = 12;

/** Ring made of rounded segments. segments: [{ label, value, color }]. */
export function Donut({ segments, center, sub, size = 150, label }) {
  const [grown, setGrown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(1));
    return () => cancelAnimationFrame(id);
  }, []);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const live = segments.filter((s) => s.value > 0);
  const gap = live.length > 1 ? STROKE + 4 : 0;
  let start = 0;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth={STROKE} />
        {total > 0 && live.map((s) => {
          const arc = (s.value / total) * C;
          const len = Math.max(0.1, arc - gap) * grown;
          const el = (
            <circle
              key={s.label}
              cx="50" cy="50" r={R} fill="none"
              stroke={s.color} strokeWidth={STROKE}
              strokeLinecap={gap ? 'round' : 'butt'}
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={-(start + gap / 2)}
              style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.32, 0.72, 0, 1)' }}
            />
          );
          start += arc;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-black tabular-nums text-slate-900">{center}</span>
        {sub && <span className="text-[0.65rem] font-semibold text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

export function Legend({ rows }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-semibold capitalize text-slate-600">{r.label}</span>
          <span className="font-black tabular-nums text-slate-800">{r.pct}</span>
        </li>
      ))}
    </ul>
  );
}

/** Smooth line through the values, last point highlighted. */
export function Trend({ values, labels, color = '#22c55e', active }) {
  const W = 300; const H = 80; const PAD = 6;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    values.length === 1 ? W / 2 : (i / (values.length - 1)) * W,
    PAD + (1 - (v - min) / span) * (H - PAD * 2),
  ]);
  let d = '';
  pts.forEach((p, i) => {
    if (i === 0) { d = `M${p[0]},${p[1]}`; return; }
    const p0 = pts[i - 2] || pts[i - 1]; const p1 = pts[i - 1]; const p3 = pts[i + 1] || p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6];
    const c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p[0]},${p[1]}`;
  });
  const a = pts[Math.min(active, pts.length - 1)];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full overflow-visible" role="img" aria-label="Net profit trend" preserveAspectRatio="none">
        <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" pathLength="1" strokeDasharray="1" className="trend-draw" />
      </svg>
      <div className="relative -mt-20 h-20 pointer-events-none" aria-hidden="true">
        {a && <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${(a[0] / W) * 100}%`, top: `${(a[1] / H) * 100}%`, background: color }} />}
      </div>
      <div className="mt-2 flex justify-between text-[0.65rem] font-semibold text-slate-500">
        {labels.map((l, i) => <span key={l + i} className={i === active ? 'text-slate-900' : ''}>{l}</span>)}
      </div>
    </div>
  );
}

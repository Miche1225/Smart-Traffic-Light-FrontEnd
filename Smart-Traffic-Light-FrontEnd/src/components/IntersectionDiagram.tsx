import type { Approach, LaneStatus, SignalState } from '../types';
import { APPROACH_LABEL, APPROACHES, SIGNAL_COLORS } from '../utils/format';
import { title } from './ui';

// 300×300 top-down crossroads; the box spans 110..190. Each approach's queue bars run outward along its arm.
const LAMP: Record<Approach, [number, number]> = { N: [82, 82], S: [218, 218], E: [218, 82], W: [82, 218] };
const PX_PER_CAR = 6;
const MAX_BAR = 95;

function bar(a: Approach, lane: number, lanes: number, q: number) {
  const len = Math.min(MAX_BAR, q * PX_PER_CAR);
  const w = 40 / lanes;
  const off = (lane - 1) * w + 2;
  const t = w - 4;
  switch (a) {
    case 'N': return { x: 110 + off, y: 110 - len, width: t, height: len };
    case 'S': return { x: 150 + off, y: 190, width: t, height: len };
    case 'E': return { x: 190, y: 110 + off, width: len, height: t };
    case 'W': return { x: 110 - len, y: 150 + off, width: len, height: t };
  }
}

export function IntersectionDiagram({ signal, lanes }: { signal?: SignalState; lanes: LaneStatus[] }) {
  const hold = signal?.mode === 'MANUAL';
  return (
    <div>
      <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-sm" role="img" aria-label="Intersection diagram with signal state and queues">
        <defs>
          <filter id="lampGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect width="300" height="300" fill="#0b1220" />
        <rect x="110" y="0" width="80" height="300" fill="#1e293b" />
        <rect x="0" y="110" width="300" height="80" fill="#1e293b" />
        {/* zebra crossings at each mouth of the box */}
        <g stroke="#334155" strokeWidth="10" strokeDasharray="4 4">
          <line x1="112" y1="103" x2="190" y2="103" /><line x1="112" y1="197" x2="190" y2="197" />
          <line x1="103" y1="112" x2="103" y2="190" /><line x1="197" y1="112" x2="197" y2="190" />
        </g>
        <g stroke="#475569" strokeDasharray="6 6">
          <line x1="150" y1="0" x2="150" y2="110" /><line x1="150" y1="190" x2="150" y2="300" />
          <line x1="0" y1="150" x2="110" y2="150" /><line x1="190" y1="150" x2="300" y2="150" />
        </g>
        {lanes.map((l) => {
          const n = lanes.filter((x) => x.approach === l.approach).length;
          return <rect key={`${l.approach}${l.lane}`} {...bar(l.approach, l.lane, n, l.queueLength)} rx="2" fill="#f97316" opacity="0.8" />;
        })}
        {APPROACHES.map((a) => {
          const p = signal?.phases.find((x) => x.approach === a);
          const [cx, cy] = LAMP[a];
          return (
            <g key={a}>
              <circle cx={cx} cy={cy} r="17" fill={p ? SIGNAL_COLORS[p.color] : '#334155'} stroke="#0f172a" strokeWidth="3" filter={p && p.color !== 'OFF' ? 'url(#lampGlow)' : undefined} />
              <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
                {p ? (hold && p.color === 'GREEN' ? 'HOLD' : p.remainingSec) : '–'}
              </text>
              <text x={cx} y={cy + (cy < 150 ? -22 : 32)} textAnchor="middle" fontSize="12" fontWeight="600" fill="#e2e8f0">{a}</text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-400">
        {signal?.phases.map((p) => (
          <li key={p.approach}>
            {APPROACH_LABEL[p.approach]}: <span className="text-slate-200">{title(p.color)}</span>{' '}
            <span className="tabular-nums">{hold && p.color === 'GREEN' ? '(held)' : `${p.remainingSec}s`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

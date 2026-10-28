import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { VehicleType } from '../types';
import { hourRange, shortHour, TOOLTIP_STYLE, VEHICLE_COLORS, VEHICLE_TYPES } from '../utils/format';

export function TypeDonut({ byType, height = 260 }: { byType: Partial<Record<VehicleType, number>>; height?: number }) {
  const data = VEHICLE_TYPES.map((t) => ({ name: t, value: byType[t] ?? 0 })).filter((d) => d.value);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" stroke="none" isAnimationActive={false}>
          {data.map((d) => <Cell key={d.name} fill={VEHICLE_COLORS[d.name]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#e2e8f0' }} formatter={(v: number) => v.toLocaleString()} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Rows × 24 hours, single-hue scale. Each cell's value is in its tooltip. */
export function Heatmap({ rows }: { rows: { label: string; values: number[] }[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} className="min-w-6 font-normal text-slate-500">{h % 3 === 0 ? shortHour(h) : ''}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal text-slate-300">{r.label}</th>
              {r.values.map((v, h) => (
                <td
                  key={h}
                  title={`${r.label}, ${hourRange(h)}: ${v.toLocaleString()} vehicles`}
                  className="h-7 rounded-sm"
                  style={{ background: `rgba(249,115,22,${(0.06 + (0.94 * v) / max).toFixed(3)})` }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-slate-500">
        Low
        <span className="h-2 w-24 rounded" style={{ background: 'linear-gradient(90deg, rgba(249,115,22,.06), rgba(249,115,22,1))' }} />
        High ({max.toLocaleString()})
      </div>
    </div>
  );
}

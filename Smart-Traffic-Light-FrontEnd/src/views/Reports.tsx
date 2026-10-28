import { useQuery } from '@tanstack/react-query';
import { Clock, Download, FileText } from 'lucide-react';
import { useState } from 'react';
import { Heatmap, TypeDonut } from '../components/charts';
import { Async, btn, Card, cx, input, PageTitle, Segmented, td, th } from '../components/ui';
import { api, qs, useIntersections } from '../services/api';
import { useAuth } from '../store/auth';
import { pushToast } from '../store/live';
import type { DailySummaryReport, VehicleType, WeeklyReport } from '../types';
import { addDays, downloadCsv, fmtDay, hourLabel, hourRange, manilaToday, VEHICLE_COLORS, VEHICLE_TYPES } from '../utils/format';
import type { PdfSection } from '../utils/pdf';

// shortcut: Monthly / Custom range and the admin schedule need backend endpoints the API doesn't define yet.
const KINDS = [{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }] as const;
const mondayOf = (date: string) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));

async function pdf(file: string, title: string, by: string, sections: PdfSection[]) {
  try {
    (await import('../utils/pdf')).exportPdf(file, title, by, sections);
  } catch (e) {
    pushToast('error', `PDF export failed: ${(e as Error).message}`);
  }
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function Daily({ r, scopeName }: { r: DailySummaryReport; scopeName: string }) {
  const user = useAuth((s) => s.user);
  const types = VEHICLE_TYPES.filter((t) => r.byType[t]);
  const exportCsv = () =>
    downloadCsv(`daily_${r.date}_${r.intersectionId}.csv`, [
      ['Hour', 'Total', ...types, 'Avg speed (km/h)'],
      ...r.hourly.map((h) => [hourRange(h.hour), h.total, ...types.map((t) => h.byType[t] ?? 0), h.avgSpeedKph]),
      [],
      ['Peak hour', hourRange(r.peakHour.hour), r.peakHour.count],
      ['Quietest hour', hourRange(r.quietestHour.hour), r.quietestHour.count],
      ['Total vehicles', r.totalVehicles],
      ['Over-speeding', r.overspeedCount],
      ['Avg wait (s)', r.avgWaitSec],
      ['Device uptime (%)', r.deviceUptimePct],
    ]);
  const exportPdf = () =>
    pdf(`daily_${r.date}_${r.intersectionId}.pdf`, `Daily traffic summary - ${fmtDay(r.date)} - ${scopeName}`, user?.name ?? '', [
      { heading: 'Peak traffic time', lines: [`Peak hour: ${hourRange(r.peakHour.hour)} - ${r.peakHour.count.toLocaleString()} vehicles`,
        `Top 3: ${r.top3Hours.map((h) => `${hourLabel(h.hour)} (${h.count.toLocaleString()})`).join(', ')}`,
        `Quietest: ${hourRange(r.quietestHour.hour)} (${r.quietestHour.count.toLocaleString()})`,
        `Total vehicles: ${r.totalVehicles.toLocaleString()} - Over-speeding: ${r.overspeedCount} - Device uptime: ${r.deviceUptimePct}%`] },
      { heading: 'Vehicles by type', table: { head: ['Type', 'Count', 'Share'], body: types.map((t) => [t, r.byType[t]!, `${((r.byType[t]! / r.totalVehicles) * 100).toFixed(1)}%`]) } },
      { heading: 'Hourly volume', table: { head: ['Hour', 'Vehicles', 'Avg speed (km/h)'], body: r.hourly.map((h) => [hourRange(h.hour), h.total, h.avgSpeedKph]) } },
      { heading: 'Average wait per intersection', table: { head: ['Intersection', 'Avg wait (s)'], body: r.avgWaitByIntersection.map((w) => [w.name, w.avgWaitSec]) } },
      { heading: 'Top over-speeding locations', table: { head: ['Intersection', 'Violations'], body: r.topViolationLocations.map((l) => [l.name, l.count]) } },
    ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={exportCsv}><Download className="size-4" />CSV</button>
        <button className={btn} onClick={exportPdf}><FileText className="size-4" />PDF</button>
      </div>
      <section className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-5">
        <div className="flex items-center gap-2 text-sm text-orange-300"><Clock className="size-4" />Peak traffic time · {fmtDay(r.date)}</div>
        <p className="mt-1 text-2xl font-semibold">
          Peak hour: {hourRange(r.peakHour.hour)} — <span className="tabular-nums">{r.peakHour.count.toLocaleString()}</span> vehicles
        </p>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total vehicles" value={r.totalVehicles.toLocaleString()} />
        <Stat label="Quietest hour" value={hourLabel(r.quietestHour.hour)} sub={`${r.quietestHour.count.toLocaleString()} vehicles`} />
        <Stat label="Over-speeding" value={String(r.overspeedCount)} sub={r.topViolationLocations[0] ? `most at ${r.topViolationLocations[0].name}` : undefined} />
        <Stat label="Device uptime" value={`${r.deviceUptimePct}%`} sub={`avg wait ${r.avgWaitSec}s`} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Top 3 busiest hours">
          <ol className="space-y-2">
            {r.top3Hours.map((h, i) => (
              <li key={h.hour} className="flex items-center gap-3 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-slate-800 text-xs font-semibold">{i + 1}</span>
                <span className="flex-1">{hourRange(h.hour)}</span>
                <span className="tabular-nums">{h.count.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-300">Average wait per intersection</h3>
          <ul className="space-y-1 text-sm">
            {r.avgWaitByIntersection.map((w) => <li key={w.intersectionId} className="flex justify-between gap-2"><span className="truncate">{w.name}</span><span className="tabular-nums">{w.avgWaitSec}s</span></li>)}
          </ul>
        </Card>
        <Card title="Vehicles by type">
          <TypeDonut byType={r.byType} height={220} />
        </Card>
        <Card title="Type breakdown">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-800"><tr><th className={th}>Type</th><th className={cx(th, 'text-right')}>Count</th><th className={cx(th, 'text-right')}>Share</th></tr></thead>
            <tbody className="divide-y divide-slate-800/70">
              {types.map((t: VehicleType) => (
                <tr key={t}>
                  <td className={cx(td, 'capitalize')}><span className="mr-2 inline-block size-2 rounded-full" style={{ background: VEHICLE_COLORS[t] }} />{t}</td>
                  <td className={cx(td, 'text-right tabular-nums')}>{r.byType[t]!.toLocaleString()}</td>
                  <td className={cx(td, 'text-right tabular-nums')}>{((r.byType[t]! / Math.max(1, r.totalVehicles)) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title="Hourly heatmap (vehicles)">
        <Heatmap rows={r.heatmap.map((h) => ({ label: h.name, values: h.hourly }))} />
      </Card>
      <Card title="Top over-speeding locations">
        {r.topViolationLocations.length ? (
          <ul className="space-y-1 text-sm">{r.topViolationLocations.map((l) => <li key={l.intersectionId} className="flex justify-between"><span>{l.name}</span><span className="tabular-nums">{l.count}</span></li>)}</ul>
        ) : <p className="text-sm text-slate-500">No over-speeding recorded.</p>}
      </Card>
    </div>
  );
}

function Weekly({ r, scopeName }: { r: WeeklyReport; scopeName: string }) {
  const user = useAuth((s) => s.user);
  const peaks = r.days.map((d) => {
    const peak = d.hourly.reduce((best, n, h) => (n > d.hourly[best] ? h : best), 0);
    return { date: d.date, peak, count: d.hourly[peak], total: d.hourly.reduce((s, n) => s + n, 0) };
  });
  const head = ['Date', 'Total', 'Peak hour', 'Peak count'];
  const body = peaks.map((p) => [fmtDay(p.date), p.total, p.total ? hourRange(p.peak) : '—', p.count]);
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button className={btn} onClick={() => downloadCsv(`weekly_${r.start}_${r.intersectionId}.csv`, [['Date', ...Array.from({ length: 24 }, (_, h) => hourLabel(h))], ...r.days.map((d) => [d.date, ...d.hourly])])}>
          <Download className="size-4" />CSV
        </button>
        <button className={btn} onClick={() => pdf(`weekly_${r.start}_${r.intersectionId}.pdf`, `Weekly peak times - week of ${fmtDay(r.start)} - ${scopeName}`, user?.name ?? '', [{ heading: 'Peak hour per day', table: { head, body } }])}>
          <FileText className="size-4" />PDF
        </button>
      </div>
      <Card title={`Week of ${fmtDay(r.start)} — recurring peak times`}>
        <Heatmap rows={r.days.map((d) => ({ label: fmtDay(d.date).slice(0, 3), values: d.hourly }))} />
      </Card>
      <Card title="Peak hour per day">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800"><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-800/70">
            {body.map((row) => <tr key={row[0]}>{row.map((c, i) => <td key={i} className={cx(td, i > 0 && 'tabular-nums')}>{typeof c === 'number' ? c.toLocaleString() : c}</td>)}</tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Reports() {
  const ints = useIntersections();
  const [kind, setKind] = useState<'daily' | 'weekly'>('daily');
  const [date, setDate] = useState(manilaToday());
  const [scope, setScope] = useState('ALL');
  const scopeName = scope === 'ALL' ? 'All intersections' : ints.data?.find((i) => i.id === scope)?.name ?? scope;
  const daily = useQuery({ queryKey: ['report', 'daily', date, scope], queryFn: () => api<DailySummaryReport>(`/reports/daily${qs({ date, intersectionId: scope })}`), enabled: kind === 'daily' });
  const start = mondayOf(date);
  const weekly = useQuery({ queryKey: ['report', 'weekly', start, scope], queryFn: () => api<WeeklyReport>(`/reports/weekly${qs({ start, intersectionId: scope })}`), enabled: kind === 'weekly' });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle title="Reports" sub="The busiest traffic times by day or week. Export to PDF for meetings." />
        <Segmented label="Report type" value={kind} onChange={setKind} options={KINDS} />
        <select aria-label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} className={input}>
          <option value="ALL">All intersections</option>
          {ints.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input type="date" aria-label="Report date" value={date} max={manilaToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className={input} />
      </div>
      {kind === 'daily'
        ? <Async q={daily} skeleton="h-96">{(r) => <Daily r={r} scopeName={scopeName} />}</Async>
        : <Async q={weekly} skeleton="h-96">{(r) => <Weekly r={r} scopeName={scopeName} />}</Async>}
    </div>
  );
}

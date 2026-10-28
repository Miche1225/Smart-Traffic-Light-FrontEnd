import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { Async, btn, btnPrimary, Card, cx, input, PageTitle, title } from '../components/ui';
import { ViolationDialog } from '../components/ViolationDialog';
import { ViolationTable } from '../components/ViolationTable';
import { api, qs, useIntersections } from '../services/api';
import { qc } from '../services/queryClient';
import { useAuth } from '../store/auth';
import { pushToast } from '../store/live';
import type { Paginated, Violation, ViolationStatus } from '../types';
import { addDays, APPROACH_LABEL, downloadCsv, fmtDateTime, manilaToday, VEHICLE_TYPES } from '../utils/format';

const STATUSES: ViolationStatus[] = ['NEW', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED', 'ISSUED'];
const SIZE = 20;
const HEAD = ['ID', 'Date/Time', 'Intersection', 'Approach', 'Vehicle', 'Speed (km/h)', 'Limit (km/h)', 'Excess', 'Plate No.', 'Status'];
const toRow = (v: Violation) => [v.id, fmtDateTime(v.timestamp), v.intersectionName, APPROACH_LABEL[v.approach], v.vehicleType, v.speedKph, v.limitKph, `+${v.speedKph - v.limitKph}`, v.plateNumber ?? '—', title(v.status)];

export default function Violations() {
  const ints = useIntersections();
  const user = useAuth((s) => s.user);
  const today = manilaToday();
  const [f, setF] = useState({ from: addDays(today, -7), to: today, intersectionId: '', type: '', status: '', minSpeed: '', maxSpeed: '' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const q = useQuery({ queryKey: ['violations', f, page], queryFn: () => api<Paginated<Violation>>(`/violations${qs({ ...f, page, size: SIZE })}`) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / SIZE));

  async function markUnderReview() {
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => api(`/violations/${id}`, { method: 'PATCH', json: { status: 'UNDER_REVIEW' } })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    pushToast(failed ? 'error' : 'success', failed ? `${failed} of ${ids.length} updates failed` : `${ids.length} marked under review`);
    setSelected(new Set());
    qc.invalidateQueries({ queryKey: ['violations'] });
  }

  async function exportAll(kind: 'csv' | 'pdf') {
    try {
      const all = await api<Paginated<Violation>>(`/violations${qs({ ...f, size: 1000 })}`);
      const name = `violations_${f.from}_${f.to}`;
      if (kind === 'csv') return downloadCsv(`${name}.csv`, [HEAD, ...all.data.map(toRow)]);
      const { exportPdf } = await import('../utils/pdf');
      exportPdf(`${name}.pdf`, `Over-speeding violations, ${f.from} to ${f.to}`, user?.name ?? '', [
        { heading: `${all.total} violations`, table: { head: HEAD, body: all.data.map(toRow) } },
      ]);
    } catch (e) {
      pushToast('error', `Export failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      {adding && <ViolationDialog onClose={() => setAdding(false)} />}
      <div className="flex flex-wrap items-center gap-2">
        <PageTitle title="Over-speeding violations" sub="Vehicles caught above the speed limit. Open one to see the photos and review it." />
        <button className={btnPrimary} onClick={() => setAdding(true)}><Plus className="size-4" />Record violation</button>
        <button className={btn} onClick={() => exportAll('csv')}><Download className="size-4" />CSV</button>
        <button className={btn} onClick={() => exportAll('pdf')}><FileText className="size-4" />PDF</button>
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2 text-xs text-slate-400">
          <label className="flex flex-col gap-1">From<input type="date" value={f.from} max={f.to} onChange={set('from')} className={input} /></label>
          <label className="flex flex-col gap-1">To<input type="date" value={f.to} min={f.from} max={today} onChange={set('to')} className={input} /></label>
          <label className="flex flex-col gap-1">Intersection
            <select value={f.intersectionId} onChange={set('intersectionId')} className={input}>
              <option value="">All</option>
              {ints.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Vehicle
            <select value={f.type} onChange={set('type')} className={cx(input, 'capitalize')}>
              <option value="">All</option>
              {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Speed (km/h)
            <span className="flex gap-1">
              <input type="number" min={0} placeholder="min" value={f.minSpeed} onChange={set('minSpeed')} className={cx(input, 'w-20')} />
              <input type="number" min={0} placeholder="max" value={f.maxSpeed} onChange={set('maxSpeed')} className={cx(input, 'w-20')} />
            </span>
          </label>
          <label className="flex flex-col gap-1">Status
            <select value={f.status} onChange={set('status')} className={input}>
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{title(s)}</option>)}
            </select>
          </label>
        </div>
        {selected.size > 0 && (
          <div className="mb-3 flex items-center gap-3 rounded-md bg-slate-800 px-3 py-2 text-sm">
            <span>{selected.size} selected</span>
            <button className={btn} onClick={markUnderReview}>Mark under review</button>
            <button className="text-slate-400 underline" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        <Async q={q} empty={(d) => !d.data.length} skeleton="h-96">
          {(d) => (
            <ViolationTable
              rows={d.data}
              selected={selected}
              onSelect={(ids, on) => setSelected((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })}
            />
          )}
        </Async>
        <div className="mt-3 flex items-center justify-between text-sm text-slate-400">
          <span className="tabular-nums">{q.data?.total ?? 0} total</span>
          <div className="flex items-center gap-2">
            <button className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span className="tabular-nums">Page {page} / {pages}</span>
            <button className={btn} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

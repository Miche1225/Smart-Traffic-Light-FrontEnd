import { useQueries } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { IntersectionDialog } from '../components/IntersectionDialog';
import { Async, btn, btnPrimary, Card, CongestionBadge, cx, input, PageTitle, StatusBadge, td, th, useConfirm } from '../components/ui';
import { api, hourlyQuery, useCameras, useIntersections, useSensors } from '../services/api';
import { qc } from '../services/queryClient';
import { ADMIN, useCan } from '../store/auth';
import { pushToast } from '../store/live';
import type { Intersection } from '../types';
import { manilaToday } from '../utils/format';

export default function Intersections() {
  const ints = useIntersections();
  const cams = useCameras().data ?? [];
  const sensors = useSensors().data ?? [];
  const isAdmin = useCan(ADMIN);
  const today = manilaToday();
  const hourly = useQueries({ queries: (ints.data ?? []).map((i) => hourlyQuery(i.id, today)) });
  const [q, setQ] = useState('');
  const [brgy, setBrgy] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Intersection | 'new' | null>(null);
  const [confirm, dialog] = useConfirm();
  const barangays = [...new Set(ints.data?.map((i) => i.barangay))];

  const remove = (i: Intersection) =>
    confirm({
      title: `Delete ${i.name}?`, danger: true, confirmLabel: 'Delete',
      body: 'This also deletes its cameras, sensors, traffic counts and violation records. It cannot be undone.',
      onConfirm: async () => {
        try {
          await api(`/intersections/${i.id}`, { method: 'DELETE' });
          pushToast('success', `${i.name} deleted`);
          qc.invalidateQueries();
        } catch (e) {
          pushToast('error', (e as Error).message);
        }
      },
    });
  const actions = (i: Intersection) => (
    <div className="flex gap-1">
      <button className={btn} aria-label={`Edit ${i.name}`} title="Edit" onClick={() => setEditing(i)}><Pencil className="size-4" /></button>
      <button className={cx(btn, 'text-red-300')} aria-label={`Delete ${i.name}`} title="Delete" onClick={() => remove(i)}><Trash2 className="size-4" /></button>
    </div>
  );

  return (
    <div className="space-y-4">
      {dialog}
      {editing && <IntersectionDialog editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <PageTitle title="Intersections" sub="Every monitored junction, its traffic level and the health of its cameras and sensors." />
        {isAdmin && <button className={btnPrimary} onClick={() => setEditing('new')}><Plus className="size-4" />Add intersection</button>}
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <input type="search" placeholder="Search name…" aria-label="Search intersections" value={q} onChange={(e) => setQ(e.target.value)} className={input} />
          <select aria-label="Barangay" value={brgy} onChange={(e) => setBrgy(e.target.value)} className={input}>
            <option value="">All barangays</option>
            {barangays.map((b) => <option key={b}>{b}</option>)}
          </select>
          <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">All statuses</option>
            <option value="ONLINE">Online</option>
            <option value="DEGRADED">Degraded</option>
            <option value="OFFLINE">Offline</option>
          </select>
        </div>
        <Async q={ints} empty={(d) => !d.length}>
          {(all) => {
            const list = all
              .map((i, k) => ({ i, today: hourly[k]?.data?.reduce((s, h) => s + h.total, 0) }))
              .filter(({ i }) => i.name.toLowerCase().includes(q.toLowerCase()) && (!brgy || i.barangay === brgy) && (!status || i.status === status));
            return (
            <>
            <ul className="space-y-2 md:hidden">
              {list.map(({ i, today: n }) => (
                <li key={i.id}>
                  <Link href={`/intersections/${i.id}`} className="block rounded-md border border-slate-800 bg-slate-950/40 p-3 hover:border-sky-700/60">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sky-300">{i.name}</div>
                        <div className="text-xs text-slate-400">Brgy. {i.barangay}</div>
                      </div>
                      <CongestionBadge level={i.congestion} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <StatusBadge status={i.status} />
                      <span>{cams.filter((c) => c.intersectionId === i.id).length} cameras</span>
                      <span>{sensors.filter((s) => s.intersectionId === i.id).length} sensors</span>
                      <span><b className="tabular-nums text-slate-200">{n?.toLocaleString() ?? '…'}</b> vehicles today</span>
                    </div>
                  </Link>
                  {isAdmin && <div className="mt-1 flex justify-end">{actions(i)}</div>}
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-800">
                  <tr>
                    {['Name', 'Barangay', 'Limit', 'Cameras', 'Sensors', 'Status', 'Congestion', 'Vehicles today', ...(isAdmin ? ['Actions'] : [])].map((h) => <th key={h} className={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {list.map(({ i, today: n }) => (
                      <tr key={i.id} className="hover:bg-slate-800/40">
                        <td className={td}><Link href={`/intersections/${i.id}`} className="font-medium text-sky-300 hover:underline">{i.name}</Link></td>
                        <td className={td}>{i.barangay}</td>
                        <td className={cx(td, 'tabular-nums')}>{i.speedLimitKph} km/h</td>
                        <td className={cx(td, 'tabular-nums')}>{cams.filter((c) => c.intersectionId === i.id).length}</td>
                        <td className={cx(td, 'tabular-nums')}>{sensors.filter((s) => s.intersectionId === i.id).length}</td>
                        <td className={td}><StatusBadge status={i.status} /></td>
                        <td className={td}><CongestionBadge level={i.congestion} /></td>
                        <td className={cx(td, 'tabular-nums')}>{n?.toLocaleString() ?? '…'}</td>
                        {isAdmin && <td className={td}>{actions(i)}</td>}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            </>
            );
          }}
        </Async>
      </Card>
    </div>
  );
}

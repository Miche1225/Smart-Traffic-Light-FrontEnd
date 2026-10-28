import { CheckCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { AlertDialog } from '../components/AlertDialog';
import { Async, btn, btnPrimary, Card, cx, input, PageTitle, SeverityBadge, title, useConfirm } from '../components/ui';
import { api, useAlerts, useIntersections } from '../services/api';
import { qc } from '../services/queryClient';
import { OPS, useCan } from '../store/auth';
import { pushToast } from '../store/live';
import type { Alert, AlertType, Severity } from '../types';
import { fmtDateTime } from '../utils/format';

const TYPES: AlertType[] = ['OVERSPEED', 'CAMERA_OFFLINE', 'SENSOR_FAULT', 'HEAVY_CONGESTION', 'SIGNAL_FAULT'];
const SEVERITIES: Severity[] = ['INFO', 'WARNING', 'CRITICAL'];
const EDGE: Record<Severity, string> = { INFO: 'border-l-sky-500', WARNING: 'border-l-yellow-500', CRITICAL: 'border-l-red-500' };

export default function Alerts() {
  const ints = useIntersections();
  const canAck = useCan(OPS);
  const [f, setF] = useState({ type: '', severity: '', intersectionId: '', ack: '' });
  const [editing, setEditing] = useState<Alert | 'new' | null>(null);
  const [confirm, dialog] = useConfirm();
  const q = useAlerts(f);
  const nameOf = (id?: string) => ints.data?.find((i) => i.id === id)?.name;

  async function ack(list: Alert[]) {
    const results = await Promise.allSettled(list.map((a) => api(`/alerts/${a.id}/ack`, { method: 'POST' })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) pushToast('error', `${failed} of ${list.length} acknowledgements failed`);
    qc.invalidateQueries({ queryKey: ['alerts'] });
  }

  const remove = (a: Alert) =>
    confirm({
      title: `Delete alert ${a.id}?`, body: a.message, danger: true, confirmLabel: 'Delete',
      onConfirm: async () => {
        try {
          await api(`/alerts/${a.id}`, { method: 'DELETE' });
          qc.invalidateQueries({ queryKey: ['alerts'] });
        } catch (e) {
          pushToast('error', (e as Error).message);
        }
      },
    });

  const select = (k: keyof typeof f, label: string, options: { value: string; label: string }[]) => (
    <select aria-label={label} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={input}>
      <option value="">{label}: all</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  const unacked = q.data?.filter((a) => !a.acknowledged) ?? [];

  return (
    <div className="space-y-4">
      {dialog}
      {editing && <AlertDialog editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <PageTitle title="Alert center" sub="Camera, sensor and traffic problems that need someone to check them." />
        {canAck && <button className={btnPrimary} onClick={() => setEditing('new')}><Plus className="size-4" />New alert</button>}
        {canAck && <button className={btn} disabled={!unacked.length} onClick={() => ack(unacked)}><CheckCheck className="size-4" />Acknowledge all ({unacked.length})</button>}
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          {select('type', 'Type', TYPES.map((t) => ({ value: t, label: title(t) })))}
          {select('severity', 'Severity', SEVERITIES.map((s) => ({ value: s, label: title(s) })))}
          {select('intersectionId', 'Intersection', ints.data?.map((i) => ({ value: i.id, label: i.name })) ?? [])}
          {select('ack', 'State', [{ value: 'false', label: 'Unacknowledged' }, { value: 'true', label: 'Acknowledged' }])}
        </div>
        <Async q={q} empty={(d) => !d.length} skeleton="h-96">
          {(list) => (
            <ul className="divide-y divide-slate-800/70">
              {list.map((a) => (
                <li key={a.id} className={cx('flex flex-wrap items-center gap-3 border-l-2 py-2.5 pl-3 text-sm transition-colors hover:bg-slate-800/30', a.acknowledged ? 'border-l-transparent opacity-60' : EDGE[a.severity])}>
                  <SeverityBadge severity={a.severity} />
                  <span className="text-xs uppercase tracking-wide text-slate-400 sm:w-36">{title(a.type)}</span>
                  <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    {a.message}
                    {nameOf(a.intersectionId) && <span className="block text-xs text-slate-500">{nameOf(a.intersectionId)}</span>}
                  </span>
                  <time className="text-xs tabular-nums text-slate-500">{fmtDateTime(a.timestamp)}</time>
                  {a.acknowledged ? <span className="ml-auto text-right text-xs text-slate-500 sm:ml-0 sm:w-24">Acknowledged</span>
                    : canAck ? <button className={cx(btn, 'ml-auto sm:ml-0 sm:w-24')} onClick={() => ack([a])}>Acknowledge</button>
                      : <span className="sm:w-24" />}
                  {canAck && (
                    <span className="flex gap-1">
                      <button className={btn} aria-label={`Edit alert ${a.id}`} title="Edit" onClick={() => setEditing(a)}><Pencil className="size-4" /></button>
                      <button className={cx(btn, 'text-red-300')} aria-label={`Delete alert ${a.id}`} title="Delete" onClick={() => remove(a)}><Trash2 className="size-4" /></button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Async>
      </Card>
    </div>
  );
}

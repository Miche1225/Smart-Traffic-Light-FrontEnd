import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Async, btn, btnDanger, btnPrimary, Card, cx, input, useConfirm, ViolationStatusBadge } from '../components/ui';
import { api } from '../services/api';
import { qc } from '../services/queryClient';
import { ADMIN, useAuth, useCan } from '../store/auth';
import { pushToast } from '../store/live';
import type { Violation } from '../types';
import { APPROACH_LABEL, downloadUrl, fmtDateTime, toPng } from '../utils/format';

function Evidence({ frames }: { frames: string[] }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-label={zoom ? 'Zoom out' : 'Zoom in'}
        className={cx('block aspect-video w-full overflow-hidden rounded-lg bg-black', zoom ? 'cursor-zoom-out' : 'cursor-zoom-in')}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom(zoom ? null : { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
      >
        <img
          src={frames[idx]}
          alt={`Evidence frame ${idx + 1}`}
          className="size-full object-contain transition-transform"
          style={zoom ? { transform: 'scale(2.5)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
        />
      </button>
      {frames.length > 1 && (
        <div className="flex gap-2">
          {frames.map((f, i) => (
            <button key={i} onClick={() => { setIdx(i); setZoom(null); }} aria-label={`Frame ${i + 1}`} className={cx('overflow-hidden rounded border-2', i === idx ? 'border-sky-500' : 'border-transparent')}>
              <img src={f} alt="" className="h-14 w-24 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ViolationDetail() {
  const id = useParams<{ id: string }>().id;
  const user = useAuth((s) => s.user);
  const isAdmin = useCan(ADMIN);
  const router = useRouter();
  const q = useQuery({ queryKey: ['violation', id], queryFn: () => api<Violation>(`/violations/${id}`) });
  const [plate, setPlate] = useState('');
  const [notes, setNotes] = useState('');
  const [confirm, dialog] = useConfirm();
  useEffect(() => { if (q.data) { setPlate(q.data.plateNumber ?? ''); setNotes(q.data.notes ?? ''); } }, [q.data]);

  const m = useMutation({
    mutationFn: (body: Partial<Pick<Violation, 'status' | 'plateNumber' | 'notes'>>) => api<Violation>(`/violations/${id}`, { method: 'PATCH', json: body }),
    onSuccess: (v) => {
      qc.setQueryData(['violation', id], v);
      qc.invalidateQueries({ queryKey: ['violations'] });
      pushToast('success', 'Violation updated');
    },
    onError: (e) => pushToast('error', e.message),
  });

  async function remove() {
    try {
      await api(`/violations/${id}`, { method: 'DELETE' });
      pushToast('success', `Violation ${id} deleted`);
      qc.invalidateQueries({ queryKey: ['violations'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
      router.replace('/violations');
    } catch (e) {
      pushToast('error', (e as Error).message);
    }
  }

  async function downloadEvidence(v: Violation) {
    try {
      const png = await toPng(v.imageUrl);
      downloadUrl(png, `${v.id}.png`);
      const { exportPdf } = await import('../utils/pdf');
      exportPdf(`${v.id}.pdf`, `Violation evidence ${v.id}`, user?.name ?? '', [
        { heading: 'Captured image', image: png },
        {
          heading: 'Details',
          table: {
            head: ['Field', 'Value'],
            body: [
              ['Timestamp', fmtDateTime(v.timestamp)], ['Intersection', v.intersectionName], ['Camera', v.cameraId],
              ['Approach / lane', `${APPROACH_LABEL[v.approach]} / ${v.lane}`], ['Vehicle type', v.vehicleType],
              ['Speed', `${v.speedKph} km/h`], ['Limit', `${v.limitKph} km/h`], ['Excess', `+${v.speedKph - v.limitKph} km/h`],
              ['Detection confidence', `${Math.round(v.confidence * 100)}%`], ['Plate number', v.plateNumber ?? '—'], ['Status', v.status],
            ],
          },
        },
        { heading: 'Audit trail', table: { head: ['When', 'By', 'Action'], body: v.audit.map((a) => [fmtDateTime(a.at), a.by, a.action]) } },
      ]);
    } catch (e) {
      pushToast('error', `Download failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      {dialog}
      <Link href="/violations" className="inline-flex items-center gap-1 text-sm text-sky-300 hover:underline"><ArrowLeft className="size-4" />Violations</Link>
      <Async q={q} skeleton="h-96">
        {(v) => {
          const reviewable = v.status === 'NEW' || v.status === 'UNDER_REVIEW';
          const info: [string, React.ReactNode][] = [
            ['Timestamp', fmtDateTime(v.timestamp)], ['Intersection', v.intersectionName], ['Camera channel', v.cameraId],
            ['Approach / lane', `${APPROACH_LABEL[v.approach]} / Lane ${v.lane}`], ['Vehicle type', <span className="capitalize">{v.vehicleType}</span>],
            ['Detected speed', <b className="tabular-nums">{v.speedKph} km/h</b>], ['Limit', `${v.limitKph} km/h`],
            ['Excess', <b className="tabular-nums text-red-400">+{v.speedKph - v.limitKph} km/h</b>],
            ['Detection confidence', <span className={cx('tabular-nums', v.confidence < 0.75 && 'text-yellow-300')}>{Math.round(v.confidence * 100)}%{v.confidence < 0.75 && ' (low — check carefully)'}</span>],
          ];
          return (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="mr-auto text-xl font-semibold tracking-tight">Violation {v.id}</h1>
                <ViolationStatusBadge status={v.status} />
              </div>
              <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
                <Card><Evidence frames={[v.imageUrl, ...v.extraFrames]} /></Card>
                <div className="space-y-4">
                  <Card title="Details">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                      {info.map(([k, val]) => <Fragment key={k}><dt className="text-slate-400">{k}</dt><dd>{val}</dd></Fragment>)}
                    </dl>
                    <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ plateNumber: plate.trim() || null, notes }); }}>
                      <label className="block text-sm">Plate number
                        <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} maxLength={12} placeholder="—" className={cx(input, 'mt-1 w-full font-mono')} />
                      </label>
                      <label className="block text-sm">Notes
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className={cx(input, 'mt-1 w-full')} />
                      </label>
                      <button type="submit" className={btn} disabled={m.isPending}>Save</button>
                    </form>
                  </Card>
                  <Card title="Actions">
                    <div className="flex flex-wrap gap-2">
                      <button className={btnPrimary} disabled={!reviewable || m.isPending}
                        onClick={() => confirm({ title: 'Verify violation', body: 'Confirms a human reviewed the evidence and speed.', onConfirm: () => m.mutate({ status: 'VERIFIED' }) })}>Verify</button>
                      <button className={btnDanger} disabled={!reviewable || m.isPending}
                        onClick={() => confirm({ title: 'Dismiss violation', reason: true, danger: true, confirmLabel: 'Dismiss',
                          onConfirm: (r) => m.mutate({ status: 'DISMISSED', notes: `${notes ? `${notes}\n` : ''}Dismissal reason: ${r}` }) })}>Dismiss</button>
                      <button className={btn} disabled={v.status !== 'VERIFIED' || m.isPending} title={v.status !== 'VERIFIED' ? 'Verify first' : undefined}
                        onClick={() => confirm({ title: 'Mark as issued', body: 'Records that a citation was issued.', onConfirm: () => m.mutate({ status: 'ISSUED' }) })}>Mark as Issued</button>
                      <button className={btn} onClick={() => downloadEvidence(v)}><Download className="size-4" />Evidence</button>
                      {isAdmin && (
                        <button className={cx(btn, 'text-red-300')}
                          onClick={() => confirm({ title: `Delete ${v.id}?`, body: 'Removes the record, its photos and audit trail for good.', danger: true, confirmLabel: 'Delete', onConfirm: remove })}>
                          <Trash2 className="size-4" />Delete
                        </button>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
              <Card title="Audit trail">
                <ol className="space-y-1.5 text-sm">
                  {[...v.audit].reverse().map((a, i) => (
                    <li key={i} className="flex flex-wrap gap-x-3">
                      <time className="tabular-nums text-slate-500">{fmtDateTime(a.at)}</time>
                      <span className="text-slate-300">{a.by}</span>
                      <span>{a.action}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            </>
          );
        }}
      </Async>
    </div>
  );
}

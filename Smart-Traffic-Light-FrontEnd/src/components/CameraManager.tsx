import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, useCameras, useIntersections } from '../services/api';
import { qc } from '../services/queryClient';
import { pushToast } from '../store/live';
import type { Approach, Camera, DeviceStatus } from '../types';
import { APPROACH_LABEL, APPROACHES } from '../utils/format';
import { Field, ModalForm } from './forms';
import { Async, btn, btnPrimary, Card, cx, input, StatusBadge, td, th, useConfirm } from './ui';

const STREAMS = ['HLS', 'MJPEG', 'WEBRTC'] as const;
const STATUSES: DeviceStatus[] = ['ONLINE', 'DEGRADED', 'OFFLINE'];

function CameraDialog({ editing, onClose }: { editing: Camera | null; onClose: () => void }) {
  const ints = useIntersections();
  const [f, setF] = useState({
    intersectionId: editing?.intersectionId ?? '', approach: editing?.approach ?? ('N' as Approach), name: editing?.name ?? '', streamUrl: editing?.streamUrl ?? '',
    streamType: editing?.streamType ?? 'HLS', resolution: editing?.resolution ?? '1920x1080', fps: String(editing?.fps ?? 25), status: editing?.status ?? ('ONLINE' as DeviceStatus),
  });
  const intersectionId = f.intersectionId || ints.data?.[0]?.id || '';
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => api<Camera>(editing ? `/cameras/${editing.id}` : '/cameras', {
      method: editing ? 'PATCH' : 'POST',
      json: {
        ...(editing ? {} : { intersectionId }), approach: f.approach, name: f.name || undefined, streamUrl: f.streamUrl, streamType: f.streamType,
        resolution: f.resolution, fps: Number(f.fps), status: f.status,
      },
    }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['cameras'] });
      qc.invalidateQueries({ queryKey: ['intersections'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      pushToast('success', `${c.name} ${editing ? 'updated' : 'added'}`);
      onClose();
    },
  });
  return (
    <ModalForm title={editing ? `Edit ${editing.name}` : 'Add camera'} onClose={onClose} onSubmit={() => m.mutate()} pending={m.isPending} error={m.error?.message} submitLabel={editing ? 'Save changes' : 'Add camera'}>
      {!editing && (
        <Field label="Intersection">
          <select required value={intersectionId} onChange={set('intersectionId')} className={cx(input, 'w-full')}>
            {ints.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Name" hint="Leave empty to name it after the intersection and channel."><input maxLength={100} value={f.name} onChange={set('name')} className={cx(input, 'w-full')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Approach">
          <select value={f.approach} onChange={set('approach')} className={cx(input, 'w-full')}>{APPROACHES.map((a) => <option key={a} value={a}>{APPROACH_LABEL[a]}</option>)}</select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={set('status')} className={cx(input, 'w-full')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
      </div>
      <Field label="Stream URL" hint="Optional. http(s):// or rtsp://. Empty shows a simulated picture."><input maxLength={500} value={f.streamUrl} onChange={set('streamUrl')} className={cx(input, 'w-full')} placeholder="https://…/stream.m3u8" /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Stream type">
          <select value={f.streamType} onChange={set('streamType')} className={cx(input, 'w-full')}>{STREAMS.map((s) => <option key={s}>{s}</option>)}</select>
        </Field>
        <Field label="Resolution"><input pattern="\d{3,5}x\d{3,5}" title="For example 1920x1080" value={f.resolution} onChange={set('resolution')} className={cx(input, 'w-full')} /></Field>
        <Field label="FPS"><input type="number" min={1} max={120} value={f.fps} onChange={set('fps')} className={cx(input, 'w-full')} /></Field>
      </div>
    </ModalForm>
  );
}

/** Settings card: list, add, edit and delete camera channels. */
export function CameraManager() {
  const cams = useCameras();
  const ints = useIntersections();
  const [editing, setEditing] = useState<Camera | 'new' | null>(null);
  const [confirm, dialog] = useConfirm();
  const nameOf = (id: string) => ints.data?.find((i) => i.id === id)?.name ?? id;

  const remove = (c: Camera) =>
    confirm({
      title: `Delete ${c.name}?`, danger: true, confirmLabel: 'Delete', body: 'The camera is removed from every page. Violations it captured are kept.',
      onConfirm: async () => {
        try {
          await api(`/cameras/${c.id}`, { method: 'DELETE' });
          pushToast('success', `${c.name} deleted`);
          qc.invalidateQueries({ queryKey: ['cameras'] });
          qc.invalidateQueries({ queryKey: ['intersections'] });
        } catch (e) {
          pushToast('error', (e as Error).message);
        }
      },
    });

  return (
    <Card title="Cameras" actions={<button className={btnPrimary} onClick={() => setEditing('new')}><Plus className="size-4" />Add camera</button>}>
      {dialog}
      {editing && <CameraDialog editing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <Async q={cams} empty={(d) => !d.length}>
        {(list) => (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr>{['ID', 'Name', 'Intersection', 'Approach', 'Stream', 'Status', 'Actions'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className={cx(td, 'font-mono text-xs')}>{c.id}</td>
                    <td className={td}>{c.name}</td>
                    <td className={td}>{nameOf(c.intersectionId)}</td>
                    <td className={td}>{APPROACH_LABEL[c.approach]}</td>
                    <td className={cx(td, 'max-w-48 truncate text-xs text-slate-400')} title={c.streamUrl}>{c.streamUrl ? `${c.streamType} · ${c.streamUrl}` : 'Simulated'}</td>
                    <td className={td}><StatusBadge status={c.status} /></td>
                    <td className={td}>
                      <div className="flex gap-1">
                        <button className={btn} aria-label={`Edit ${c.name}`} title="Edit" onClick={() => setEditing(c)}><Pencil className="size-4" /></button>
                        <button className={cx(btn, 'text-red-300')} aria-label={`Delete ${c.name}`} title="Delete" onClick={() => remove(c)}><Trash2 className="size-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Async>
    </Card>
  );
}

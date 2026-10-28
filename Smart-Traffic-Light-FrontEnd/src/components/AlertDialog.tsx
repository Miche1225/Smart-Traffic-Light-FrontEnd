import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, useIntersections } from '../services/api';
import { qc } from '../services/queryClient';
import { pushToast } from '../store/live';
import type { Alert, AlertType, Severity } from '../types';
import { Field, ModalForm } from './forms';
import { cx, input, title } from './ui';

const TYPES: AlertType[] = ['OVERSPEED', 'CAMERA_OFFLINE', 'SENSOR_FAULT', 'HEAVY_CONGESTION', 'SIGNAL_FAULT'];
const SEVERITIES: Severity[] = ['INFO', 'WARNING', 'CRITICAL'];

/** Create an alert by hand (for example something a field officer reports), or edit an existing alert's text and severity. */
export function AlertDialog({ editing, onClose }: { editing: Alert | null; onClose: () => void }) {
  const ints = useIntersections();
  const [f, setF] = useState({
    type: editing?.type ?? ('SIGNAL_FAULT' as AlertType), severity: editing?.severity ?? ('WARNING' as Severity),
    intersectionId: editing?.intersectionId ?? '', message: editing?.message ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => api<Alert>(editing ? `/alerts/${editing.id}` : '/alerts', {
      method: editing ? 'PATCH' : 'POST',
      json: editing
        ? { type: f.type, severity: f.severity, message: f.message }
        : { type: f.type, severity: f.severity, message: f.message, intersectionId: f.intersectionId || undefined },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      pushToast('success', editing ? 'Alert updated' : 'Alert created');
      onClose();
    },
  });
  return (
    <ModalForm title={editing ? `Edit alert ${editing.id}` : 'New alert'} onClose={onClose} onSubmit={() => m.mutate()} pending={m.isPending} error={m.error?.message} submitLabel={editing ? 'Save changes' : 'Create alert'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select value={f.type} onChange={set('type')} className={cx(input, 'w-full')}>{TYPES.map((t) => <option key={t} value={t}>{title(t)}</option>)}</select>
        </Field>
        <Field label="Severity">
          <select value={f.severity} onChange={set('severity')} className={cx(input, 'w-full')}>{SEVERITIES.map((s) => <option key={s} value={s}>{title(s)}</option>)}</select>
        </Field>
      </div>
      {!editing && (
        <Field label="Intersection (optional)">
          <select value={f.intersectionId} onChange={set('intersectionId')} className={cx(input, 'w-full')}>
            <option value="">None</option>
            {ints.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
      )}
      <Field label="Message"><textarea required autoFocus rows={3} minLength={3} maxLength={300} value={f.message} onChange={set('message')} className={cx(input, 'w-full')} placeholder="What happened and where?" /></Field>
    </ModalForm>
  );
}

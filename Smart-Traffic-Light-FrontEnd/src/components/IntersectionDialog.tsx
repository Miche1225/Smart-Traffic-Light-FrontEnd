import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { qc } from '../services/queryClient';
import { api } from '../services/api';
import { pushToast } from '../store/live';
import type { Intersection, SignalMode } from '../types';
import { Field, ModalForm, numOrUndef } from './forms';
import { cx, input } from './ui';

const MODES: SignalMode[] = ['ADAPTIVE', 'FIXED', 'MANUAL'];

/** Add a new intersection (`editing` = null) or edit an existing one. */
export function IntersectionDialog({ editing, onClose }: { editing: Intersection | null; onClose: () => void }) {
  const [f, setF] = useState({
    name: editing?.name ?? '', barangay: editing?.barangay ?? '', lat: editing ? String(editing.lat) : '', lng: editing ? String(editing.lng) : '',
    mode: editing?.mode ?? 'ADAPTIVE', speedLimitKph: String(editing?.speedLimitKph ?? 40),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => api<Intersection>(editing ? `/intersections/${editing.id}` : '/intersections', {
      method: editing ? 'PATCH' : 'POST',
      json: { name: f.name, barangay: f.barangay, lat: numOrUndef(f.lat), lng: numOrUndef(f.lng), mode: f.mode, speedLimitKph: numOrUndef(f.speedLimitKph) },
    }),
    onSuccess: (i) => {
      qc.invalidateQueries({ queryKey: ['intersections'] });
      pushToast('success', editing ? `${i.name} updated` : `${i.name} added`);
      onClose();
    },
  });
  return (
    <ModalForm title={editing ? `Edit ${editing.name}` : 'Add intersection'} onClose={onClose} onSubmit={() => m.mutate()} pending={m.isPending} error={m.error?.message} submitLabel={editing ? 'Save changes' : 'Add intersection'}>
      <Field label="Name"><input required autoFocus minLength={2} maxLength={100} value={f.name} onChange={set('name')} className={cx(input, 'w-full')} placeholder="Main St – Rizal Ave" /></Field>
      <Field label="Barangay"><input maxLength={60} value={f.barangay} onChange={set('barangay')} className={cx(input, 'w-full')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude"><input type="number" step="any" min={-90} max={90} value={f.lat} onChange={set('lat')} className={cx(input, 'w-full')} /></Field>
        <Field label="Longitude"><input type="number" step="any" min={-180} max={180} value={f.lng} onChange={set('lng')} className={cx(input, 'w-full')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Speed limit (km/h)"><input required type="number" min={10} max={120} step={1} value={f.speedLimitKph} onChange={set('speedLimitKph')} className={cx(input, 'w-full')} /></Field>
        <Field label="Signal mode">
          <select value={f.mode} onChange={set('mode')} className={cx(input, 'w-full')}>{MODES.map((x) => <option key={x}>{x}</option>)}</select>
        </Field>
      </div>
    </ModalForm>
  );
}

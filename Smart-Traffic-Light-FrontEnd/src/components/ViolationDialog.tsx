import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api, useCameras, useIntersections } from '../services/api';
import { qc } from '../services/queryClient';
import { pushToast } from '../store/live';
import type { Approach, Violation } from '../types';
import { APPROACH_LABEL, APPROACHES, VEHICLE_TYPES } from '../utils/format';
import { Field, ModalForm } from './forms';
import { cx, input } from './ui';

/** Current Manila time as the value of a datetime-local input (Manila is UTC+8 all year). */
const manilaNow = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16);

/** Record an over-speeding violation by hand (for example one a traffic enforcer saw). */
export function ViolationDialog({ onClose }: { onClose: () => void }) {
  const ints = useIntersections();
  const [f, setF] = useState({ intersectionId: '', cameraId: '', approach: 'N' as Approach, lane: '1', vehicleType: 'car', speedKph: '', plateNumber: '', when: manilaNow(), notes: '' });
  const intersectionId = f.intersectionId || ints.data?.[0]?.id || '';
  const limit = ints.data?.find((i) => i.id === intersectionId)?.speedLimitKph;
  const cams = useCameras(intersectionId || undefined);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value, ...(k === 'intersectionId' ? { cameraId: '' } : {}) });
  const m = useMutation({
    mutationFn: () => api<Violation>('/violations', {
      method: 'POST',
      json: {
        intersectionId, cameraId: f.cameraId || undefined, approach: f.approach, lane: Number(f.lane), vehicleType: f.vehicleType,
        speedKph: Number(f.speedKph), plateNumber: f.plateNumber || undefined, notes: f.notes || undefined,
        timestamp: new Date(`${f.when}:00+08:00`).toISOString(), // the form is in Manila time
      },
    }),
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ['violations'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
      pushToast('success', `Violation ${v.id} recorded`);
      onClose();
    },
  });
  return (
    <ModalForm title="Record a violation" onClose={onClose} onSubmit={() => m.mutate()} pending={m.isPending} error={m.error?.message} submitLabel="Record violation">
      <Field label="Intersection">
        <select required value={intersectionId} onChange={set('intersectionId')} className={cx(input, 'w-full')}>
          {ints.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Camera (optional)">
          <select value={f.cameraId} onChange={set('cameraId')} className={cx(input, 'w-full')}>
            <option value="">None</option>
            {cams.data?.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
        </Field>
        <Field label="Approach">
          <select value={f.approach} onChange={set('approach')} className={cx(input, 'w-full')}>
            {APPROACHES.map((a) => <option key={a} value={a}>{APPROACH_LABEL[a]}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Lane"><input required type="number" min={1} max={8} value={f.lane} onChange={set('lane')} className={cx(input, 'w-full')} /></Field>
        <Field label="Vehicle">
          <select value={f.vehicleType} onChange={set('vehicleType')} className={cx(input, 'w-full capitalize')}>{VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Speed (km/h)" hint={limit ? `Limit ${limit}` : undefined}>
          <input required type="number" min={1} max={300} value={f.speedKph} onChange={set('speedKph')} className={cx(input, 'w-full')} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plate number (optional)"><input value={f.plateNumber} maxLength={12} onChange={(e) => setF({ ...f, plateNumber: e.target.value.toUpperCase() })} className={cx(input, 'w-full font-mono')} /></Field>
        <Field label="Date and time (Manila)"><input required type="datetime-local" max={manilaNow()} value={f.when} onChange={set('when')} className={cx(input, 'w-full')} /></Field>
      </div>
      <Field label="Notes (optional)"><textarea rows={2} maxLength={2000} value={f.notes} onChange={set('notes')} className={cx(input, 'w-full')} /></Field>
    </ModalForm>
  );
}

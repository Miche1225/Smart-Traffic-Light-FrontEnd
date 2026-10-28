import { useEffect, useState, type CSSProperties } from 'react';
import { CameraTile } from '../components/CameraTile';
import { Async, btn, Dialog, input, PageTitle, Segmented } from '../components/ui';
import { useCameras, useIntersections } from '../services/api';
import { subscribe } from '../services/ws';
import { useLive } from '../store/live';
import type { Camera } from '../types';
import { VEHICLE_COLORS, VEHICLE_TYPES } from '../utils/format';

const GRIDS = [1, 2, 3, 4].map((n) => ({ value: n, label: `${n}×${n}` }));

function LiveCounts({ cameraId }: { cameraId: string }) {
  const frame = useLive((s) => s.frames[cameraId]);
  const total = frame?.detections.length ?? 0;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-300">Vehicles in frame: <span className="tabular-nums">{total}</span></h3>
      <ul className="space-y-1.5 text-sm">
        {VEHICLE_TYPES.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: VEHICLE_COLORS[t] }} aria-hidden />
            <span className="flex-1 capitalize">{t}</span>
            <span className="tabular-nums">{frame?.countsByType[t] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LiveView() {
  const ints = useIntersections();
  const cams = useCameras();
  const [n, setN] = useState(3);
  const [filter, setFilter] = useState('');
  const [overlay, setOverlay] = useState(true);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Camera | null>(null);
  const nameOf = (id: string) => ints.data?.find((i) => i.id === id)?.name ?? id;

  const list = (cams.data ?? []).filter((c) => !filter || c.intersectionId === filter);
  const per = n * n;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const visible = list.slice(page * per, page * per + per);
  useEffect(() => setPage(0), [n, filter]);
  const visibleIds = visible.map((c) => c.id).join();
  useEffect(() => subscribe(visibleIds.split(',').filter(Boolean).map((id) => `camera:${id}`)), [visibleIds]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PageTitle title="Live View" sub="Every camera channel with live vehicle detection. Click a camera to see it larger." />
        <select aria-label="Filter by intersection" value={filter} onChange={(e) => setFilter(e.target.value)} className={input}>
          <option value="">All intersections</option>
          {ints.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <div className="hidden sm:block"><Segmented label="Grid layout" value={n} onChange={setN} options={GRIDS} /></div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />
          Bounding boxes
        </label>
      </div>
      <Async q={cams} empty={() => !list.length} skeleton="h-96">
        {() => (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ '--n': n } as CSSProperties}>
            {visible.map((c) => <CameraTile key={c.id} camera={c} label={nameOf(c.intersectionId)} overlay={overlay} onOpen={() => setOpen(c)} />)}
          </div>
        )}
      </Async>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button className={btn} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="tabular-nums">Page {page + 1} / {pages}</span>
          <button className={btn} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
      <Dialog wide open={!!open} title={open ? `${nameOf(open.intersectionId)} — Channel ${open.channel}` : ''} onClose={() => setOpen(null)}>
        {open && (
          <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
            <CameraTile camera={open} label={nameOf(open.intersectionId)} overlay={overlay} />
            <LiveCounts cameraId={open.id} />
          </div>
        )}
      </Dialog>
    </div>
  );
}

import Link from 'next/link';
import type { Violation } from '../types';
import { APPROACH_LABEL, fmtDateTime } from '../utils/format';
import { cx, td, th, ViolationStatusBadge } from './ui';

const excessTone = (n: number) => (n > 20 ? 'text-red-400' : n > 10 ? 'text-orange-400' : 'text-yellow-300');

/** `evidence` false hides thumbnails/plates and detail links (viewers, RA 10173). */
export function ViolationTable({ rows, evidence = true, selected, onSelect }: { rows: Violation[]; evidence?: boolean; selected?: Set<string>; onSelect?: (ids: string[], on: boolean) => void }) {
  const all = selected && rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <>
    <ul className="space-y-2 md:hidden">
      {rows.map((v) => {
        const excess = v.speedKph - v.limitKph;
        const body = (
          <>
            {evidence && <img src={v.imageUrl} alt={`Evidence ${v.id}`} className="h-14 w-20 shrink-0 rounded object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold text-slate-100"><span className="capitalize">{v.vehicleType}</span> · <span className="tabular-nums">{v.speedKph} km/h</span></span>
                <span className={cx('shrink-0 text-sm font-semibold tabular-nums', excessTone(excess))}>+{excess}</span>
              </div>
              <div className="truncate text-xs text-slate-400">{v.intersectionName} · {APPROACH_LABEL[v.approach]}</div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>{fmtDateTime(v.timestamp)}{evidence && v.plateNumber && <> · <span className="font-mono text-slate-300">{v.plateNumber}</span></>}</span>
                <ViolationStatusBadge status={v.status} />
              </div>
            </div>
          </>
        );
        return (
          <li key={v.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/40 p-2.5">
            {onSelect && <input type="checkbox" aria-label={`Select ${v.id}`} checked={selected?.has(v.id) ?? false} onChange={(e) => onSelect([v.id], e.target.checked)} />}
            {evidence ? <Link href={`/violations/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">{body}</Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>}
          </li>
        );
      })}
    </ul>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800">
          <tr>
            {onSelect && (
              <th className={th}>
                <input type="checkbox" aria-label="Select all on page" checked={!!all} onChange={(e) => onSelect(rows.map((r) => r.id), e.target.checked)} />
              </th>
            )}
            {evidence && <th className={th}>Image</th>}
            <th className={th}>Date/Time</th>
            <th className={th}>Intersection</th>
            <th className={th}>Approach</th>
            <th className={th}>Vehicle</th>
            <th className={cx(th, 'text-right')}>Speed (km/h)</th>
            <th className={cx(th, 'text-right')}>Limit (km/h)</th>
            <th className={cx(th, 'text-right')}>Excess</th>
            {evidence && <th className={th}>Plate No.</th>}
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {rows.map((v) => {
            const excess = v.speedKph - v.limitKph;
            return (
              <tr key={v.id} className="hover:bg-slate-800/40">
                {onSelect && (
                  <td className={td}>
                    <input type="checkbox" aria-label={`Select ${v.id}`} checked={selected?.has(v.id) ?? false} onChange={(e) => onSelect([v.id], e.target.checked)} />
                  </td>
                )}
                {evidence && (
                  <td className={td}>
                    <Link href={`/violations/${v.id}`}><img src={v.imageUrl} alt={`Evidence ${v.id}`} className="h-10 w-16 rounded object-cover" /></Link>
                  </td>
                )}
                <td className={cx(td, 'whitespace-nowrap')}>
                  {evidence ? <Link href={`/violations/${v.id}`} className="text-sky-300 hover:underline">{fmtDateTime(v.timestamp)}</Link> : fmtDateTime(v.timestamp)}
                </td>
                <td className={td}>{v.intersectionName}</td>
                <td className={td}>{APPROACH_LABEL[v.approach]}</td>
                <td className={cx(td, 'capitalize')}>{v.vehicleType}</td>
                <td className={cx(td, 'text-right tabular-nums font-semibold')}>{v.speedKph}</td>
                <td className={cx(td, 'text-right tabular-nums text-slate-400')}>{v.limitKph}</td>
                <td className={cx(td, 'text-right tabular-nums font-semibold', excessTone(excess))}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-800" aria-hidden>
                      <span className="block h-full rounded-full bg-current" style={{ width: `${Math.min(100, (excess / 30) * 100)}%` }} />
                    </span>
                    +{excess}
                  </span>
                </td>
                {evidence && <td className={cx(td, 'font-mono')}>{v.plateNumber ?? '—'}</td>}
                <td className={td}><ViolationStatusBadge status={v.status} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

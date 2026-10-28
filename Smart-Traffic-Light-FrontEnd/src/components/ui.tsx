import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangle, Inbox, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { dismissToast, useLive } from '../store/live';
import type { CongestionLevel, DeviceStatus, Severity, SignalColor, VehicleType, ViolationStatus } from '../types';
import { SIGNAL_COLORS, VEHICLE_COLORS } from '../utils/format';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

export const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 shadow-sm shadow-black/20 transition-colors hover:border-slate-600 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500';
export const btnPrimary = `${btn} border-sky-600 bg-sky-600 text-white hover:border-sky-500 hover:bg-sky-500`;
export const btnDanger = `${btn} border-red-700 bg-red-700 text-white hover:bg-red-600`;
export const input =
  'rounded-md border border-slate-700 bg-slate-950/80 px-2.5 py-1.5 text-sm text-slate-200 transition-colors placeholder:text-slate-500 hover:border-slate-600 focus:border-sky-600 focus:outline-2 focus:outline-sky-500/60';
export const th = 'px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500';
export const td = 'px-3 py-2';

export function Card({ title: t, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx('min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm shadow-black/10', className)}>
      {(t || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-slate-100">{t}</h2>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

/** Page heading with a one-line explanation of what the page is for. */
export function PageTitle({ title: t, sub }: { title: ReactNode; sub: ReactNode }) {
  return (
    <div className="mr-auto min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{t}</h1>
      <p className="mt-0.5 text-sm text-slate-400">{sub}</p>
    </div>
  );
}

/** A tiny three-lamp signal head; the app's logo. Fixed colors so it reads the same in both themes. */
export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const lamp = size === 'lg' ? 'size-3' : 'size-2';
  return (
    <span className={cx('flex shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-[#0a1326] ring-1 ring-white/15', size === 'lg' ? 'h-14 w-7' : 'h-10 w-5')} aria-hidden>
      <span className={cx(lamp, 'rounded-full bg-[#ef4444]')} />
      <span className={cx(lamp, 'rounded-full bg-[#facc15]')} />
      <span className={cx(lamp, 'rounded-full bg-[#22c55e]')} />
    </span>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-md bg-slate-800/70', className)} />;

/** Loading skeleton, error with retry, and empty state for a query. */
export function Async<T>({ q, children, empty, skeleton = 'h-32' }: { q: UseQueryResult<T>; children: (d: T) => ReactNode; empty?: (d: T) => boolean; skeleton?: string }) {
  if (q.isPending) return <Skeleton className={skeleton} />;
  if (q.isError)
    return (
      <div role="alert" className="flex items-center gap-2 rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        <AlertTriangle className="size-4 shrink-0" />
        {q.error.message}
        <button className="ml-auto underline" onClick={() => q.refetch()}>Retry</button>
      </div>
    );
  if (empty?.(q.data))
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500">
        <span className="grid size-10 place-items-center rounded-full bg-slate-800/70 ring-1 ring-inset ring-slate-700"><Inbox className="size-5" /></span>
        Nothing to show
      </div>
    );
  return <>{children(q.data)}</>;
}

const TONE = {
  green: 'bg-green-500/15 text-green-400 ring-green-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 ring-yellow-500/30',
  orange: 'bg-orange-500/15 text-orange-400 ring-orange-500/30',
  red: 'bg-red-500/15 text-red-400 ring-red-500/30',
  blue: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  slate: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};
export type Tone = keyof typeof TONE;
export const Badge = ({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) => (
  <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone])}>{children}</span>
);

const CONGESTION: Record<CongestionLevel, Tone> = { LOW: 'green', MODERATE: 'yellow', HEAVY: 'orange', SEVERE: 'red' };
export const CongestionBadge = ({ level }: { level: CongestionLevel }) => <Badge tone={CONGESTION[level]}>{title(level)}</Badge>;

const STATUS: Record<DeviceStatus, Tone> = { ONLINE: 'green', DEGRADED: 'yellow', OFFLINE: 'red' };
export const StatusBadge = ({ status }: { status: DeviceStatus }) => (
  <Badge tone={STATUS[status]}>
    <span className="size-1.5 rounded-full bg-current" aria-hidden />
    {title(status)}
  </Badge>
);

const SEVERITY: Record<Severity, Tone> = { INFO: 'blue', WARNING: 'yellow', CRITICAL: 'red' };
export const SeverityBadge = ({ severity }: { severity: Severity }) => <Badge tone={SEVERITY[severity]}>{title(severity)}</Badge>;

const VSTATUS: Record<ViolationStatus, Tone> = { NEW: 'blue', UNDER_REVIEW: 'yellow', VERIFIED: 'orange', DISMISSED: 'slate', ISSUED: 'red' };
export const ViolationStatusBadge = ({ status }: { status: ViolationStatus }) => <Badge tone={VSTATUS[status]}>{title(status)}</Badge>;

/** Colored lamp plus text, never color alone. */
export const SignalLight = ({ color, label, sec }: { color: SignalColor; label?: string; sec?: number }) => (
  <span className="inline-flex items-center gap-1.5 text-xs">
    <span
      className={cx('size-3 shrink-0 rounded-full ring-2 ring-black/30', color === 'FLASHING' && 'motion-safe:animate-pulse')}
      style={{ background: SIGNAL_COLORS[color], boxShadow: color === 'OFF' ? undefined : `0 0 8px 1px ${SIGNAL_COLORS[color]}99` }}
      aria-hidden
    />
    {label && <b className="font-semibold">{label}</b>}
    <span className="text-slate-300">{title(color)}</span>
    {sec != null && <span className="tabular-nums text-slate-400">{sec}s</span>}
  </span>
);

export const TypeChips = ({ counts }: { counts: Partial<Record<VehicleType, number>> }) => {
  const entries = (Object.entries(counts) as [VehicleType, number][]).filter(([, n]) => n);
  if (!entries.length) return <span className="text-xs text-slate-500">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([t, n]) => (
        <span key={t} className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs">
          <span className="size-2 rounded-full" style={{ background: VEHICLE_COLORS[t] }} aria-hidden />
          {t} <b className="tabular-nums">{n}</b>
        </span>
      ))}
    </div>
  );
};

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-slate-700 bg-slate-950/80 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx('rounded px-2.5 py-1 text-xs font-medium transition-colors', o.value === value ? 'bg-slate-700 text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-800">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === value}
          onClick={() => onChange(t)}
          className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors', t === value ? 'border-sky-500 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200')}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ open, title: t, onClose, wide, children }: { open: boolean; title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && !d?.open) d?.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={cx('m-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-2xl shadow-black/50 backdrop:bg-black/70 backdrop:backdrop-blur-sm', wide ? 'w-[96vw] max-w-[1600px]' : 'w-[92vw] max-w-md')}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t}</h2>
        <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-800"><X className="size-4" /></button>
      </div>
      {open && children}
    </dialog>
  );
}

interface ConfirmOpts { title: string; body?: ReactNode; reason?: boolean; confirmLabel?: string; danger?: boolean; onConfirm: (reason: string) => void }
/** `const [confirm, dialog] = useConfirm()`: render `dialog`, call `confirm({...})`. */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [reason, setReason] = useState('');
  const close = () => setOpts(null);
  const dialog = (
    <Dialog open={!!opts} title={opts?.title ?? ''} onClose={close}>
      {opts && (
        <form onSubmit={(e) => { e.preventDefault(); opts.onConfirm(reason.trim()); close(); }}>
          {opts.body && <div className="mb-3 text-sm text-slate-400">{opts.body}</div>}
          {opts.reason && (
            <label className="block text-sm">
              Reason (required)
              <textarea required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} className={cx(input, 'mt-1 w-full')} rows={3} />
            </label>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={btn} onClick={close}>Cancel</button>
            <button type="submit" className={opts.danger ? btnDanger : btnPrimary}>{opts.confirmLabel ?? 'Confirm'}</button>
          </div>
        </form>
      )}
    </Dialog>
  );
  return [(o: ConfirmOpts) => { setReason(''); setOpts(o); }, dialog] as const;
}

const TOAST_STYLE = {
  info: 'border-sky-800 bg-slate-900',
  success: 'border-green-800 bg-slate-900',
  error: 'border-red-800 bg-red-950',
  critical: 'border-red-600 bg-red-950',
};
export function Toaster() {
  const toasts = useLive((s) => s.toasts);
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === 'critical' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded-lg border p-3 text-sm shadow-xl shadow-black/40 motion-safe:animate-toast-in', TOAST_STYLE[t.tone])}>
          {t.tone === 'critical' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-400" aria-label="Critical" />}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="text-slate-400 hover:text-white"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

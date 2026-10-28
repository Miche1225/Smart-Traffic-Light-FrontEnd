import type { ReactNode } from 'react';
import { btn, btnPrimary, cx, Dialog } from './ui';

/** A labelled form control. Wrap an <input>/<select>; `hint` is small help text underneath. */
export function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx('block text-sm', className)}>
      {label}
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * A dialog around a form: Cancel and Save buttons, a busy state and the server's error message.
 * Mount it only while it is needed (`{item && <MyDialog …/>}`) so each opening starts with fresh fields.
 */
export function ModalForm({ title, onClose, onSubmit, pending, error, submitLabel = 'Save', children }: {
  title: string; onClose: () => void; onSubmit: () => void; pending?: boolean; error?: string; submitLabel?: string; children: ReactNode;
}) {
  return (
    <Dialog open title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
        {children}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={btn} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pending} className={btnPrimary}>{pending ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Empty string -> undefined, otherwise the number (so blank optional fields are not sent). */
export const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s));

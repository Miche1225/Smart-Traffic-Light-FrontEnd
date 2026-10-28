import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../services/api';
import { qc } from '../services/queryClient';
import { useAuth } from '../store/auth';
import { pushToast } from '../store/live';
import type { Role, UserAccount } from '../types';
import { fmtDate } from '../utils/format';
import { Field, ModalForm } from './forms';
import { Async, btn, btnPrimary, Card, cx, input, td, th, title, useConfirm } from './ui';

const ROLES: Role[] = ['ADMIN', 'OPERATOR', 'VIEWER'];

function UserDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', username: '', role: 'OPERATOR' as Role, password: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () => api<UserAccount>('/users', { method: 'POST', json: f }),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['users'] }); pushToast('success', `${u.name} added`); onClose(); },
  });
  return (
    <ModalForm title="Add user" onClose={onClose} onSubmit={() => m.mutate()} pending={m.isPending} error={m.error?.message} submitLabel="Add user">
      <Field label="Full name"><input required autoFocus minLength={2} maxLength={60} value={f.name} onChange={set('name')} className={cx(input, 'w-full')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Username"><input required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" title="Letters, numbers, dots and underscores" value={f.username} onChange={set('username')} className={cx(input, 'w-full')} /></Field>
        <Field label="Role">
          <select value={f.role} onChange={set('role')} className={cx(input, 'w-full')}>{ROLES.map((r) => <option key={r} value={r}>{title(r)}</option>)}</select>
        </Field>
      </div>
      <Field label="Password" hint="At least 8 characters. Share it with the person privately."><input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={f.password} onChange={set('password')} className={cx(input, 'w-full')} /></Field>
    </ModalForm>
  );
}

/** Settings card for administrators: list accounts, change roles, add and remove users. */
export function UserManager() {
  const me = useAuth((s) => s.user);
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<UserAccount[]>('/users') });
  const [adding, setAdding] = useState(false);
  const [confirm, dialog] = useConfirm();

  async function setRole(u: UserAccount, role: Role) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', json: { role } });
      pushToast('success', `${u.name} is now ${title(role).toLowerCase()}`);
    } catch (e) {
      pushToast('error', (e as Error).message);
    }
    qc.invalidateQueries({ queryKey: ['users'] });
  }
  const remove = (u: UserAccount) =>
    confirm({
      title: `Delete ${u.name}?`, danger: true, confirmLabel: 'Delete', body: `The account "${u.username}" can no longer sign in.`,
      onConfirm: async () => {
        try {
          await api(`/users/${u.id}`, { method: 'DELETE' });
          pushToast('success', `${u.name} deleted`);
        } catch (e) {
          pushToast('error', (e as Error).message);
        }
        qc.invalidateQueries({ queryKey: ['users'] });
      },
    });

  return (
    <Card title="Users" actions={<button className={btnPrimary} onClick={() => setAdding(true)}><Plus className="size-4" />Add user</button>}>
      {dialog}
      {adding && <UserDialog onClose={() => setAdding(false)} />}
      <p className="mb-3 text-sm text-slate-400">People who register themselves start as viewers. Promote them here to let them review violations or change settings.</p>
      <Async q={q} empty={(d) => !d.length}>
        {(list) => (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800">
                <tr>{['Name', 'Username', 'Role', 'Created', 'Actions'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {list.map((u) => (
                  <tr key={u.id}>
                    <td className={td}>{u.name}{u.id === me?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                    <td className={cx(td, 'font-mono text-xs')}>{u.username}</td>
                    <td className={td}>
                      <select aria-label={`Role of ${u.name}`} value={u.role} onChange={(e) => setRole(u, e.target.value as Role)} className={input}>
                        {ROLES.map((r) => <option key={r} value={r}>{title(r)}</option>)}
                      </select>
                    </td>
                    <td className={cx(td, 'text-slate-400')}>{fmtDate(u.createdAt)}</td>
                    <td className={td}>
                      <button className={cx(btn, 'text-red-300')} disabled={u.id === me?.id} aria-label={`Delete ${u.name}`} title={u.id === me?.id ? 'You cannot delete yourself' : 'Delete'} onClick={() => remove(u)}><Trash2 className="size-4" /></button>
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

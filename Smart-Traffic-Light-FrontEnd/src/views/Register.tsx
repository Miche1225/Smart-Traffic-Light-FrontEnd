import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AuthShell from '../components/AuthShell';
import { btnPrimary, cx, input, Logo } from '../components/ui';
import { api } from '../services/api';
import { useAuth } from '../store/auth';
import type { User } from '../types';

/** Self-registration. New accounts are viewers; an administrator can promote them in Settings → Users. */
export default function Register() {
  const { token, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [problem, setProblem] = useState('');
  const m = useMutation({
    mutationFn: () => api<{ token: string; user: User }>('/auth/register', { method: 'POST', json: { name: form.name, username: form.username, password: form.password } }),
    onSuccess: (r) => { login(r.token, r.user, true); router.replace('/'); },
  });
  useEffect(() => { if (useAuth.getState().token) router.replace('/'); }, [router]);
  if (token) return null;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setProblem(''); };
  function submit() {
    if (form.password.length < 8) return setProblem('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setProblem('The two passwords do not match');
    m.mutate();
  }

  return (
    <AuthShell>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="w-full space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Create your account</h1>
            <p className="text-sm text-slate-400">SMART Traffic Light · LGU Dashboard</p>
          </div>
        </div>
        <label className="block text-sm">
          Full name
          <input required autoFocus autoComplete="name" minLength={2} maxLength={60} value={form.name} onChange={set('name')} className={cx(input, 'mt-1 w-full')} />
        </label>
        <label className="block text-sm">
          Username
          <input required autoComplete="username" minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" title="Letters, numbers, dots and underscores" value={form.username} onChange={set('username')} className={cx(input, 'mt-1 w-full')} />
        </label>
        <label className="block text-sm">
          Password
          <input required type="password" autoComplete="new-password" minLength={8} maxLength={72} value={form.password} onChange={set('password')} className={cx(input, 'mt-1 w-full')} />
          <span className="mt-1 block text-xs text-slate-500">At least 8 characters.</span>
        </label>
        <label className="block text-sm">
          Confirm password
          <input required type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} className={cx(input, 'mt-1 w-full')} />
        </label>
        {(problem || m.isError) && <p role="alert" className="text-sm text-red-400">{problem || m.error?.message}</p>}
        <button type="submit" disabled={m.isPending} className={cx(btnPrimary, 'w-full')}>{m.isPending ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-400">Already registered? <Link href="/login" className="text-sky-300 hover:underline">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

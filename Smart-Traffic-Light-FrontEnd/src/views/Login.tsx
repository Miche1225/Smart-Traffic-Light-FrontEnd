import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthShell from '../components/AuthShell';
import { btnPrimary, cx, input, Logo } from '../components/ui';
import { api } from '../services/api';
import { USE_MOCKS } from '../services/ws';
import { useAuth } from '../store/auth';
import type { User } from '../types';

/** `?from=` set by middleware; only same-site paths, so the login page can't be used as an open redirect. */
const returnTo = () => {
  const from = new URLSearchParams(window.location.search).get('from') ?? '/';
  return from.startsWith('/') && !from.startsWith('//') ? from : '/';
};

export default function Login() {
  const { token, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '', remember: true });
  const m = useMutation({
    mutationFn: () => api<{ token: string; user: User }>('/auth/login', { method: 'POST', json: { username: form.username, password: form.password } }),
    onSuccess: (r) => { login(r.token, r.user, form.remember); router.replace(returnTo()); },
  });
  // Only for arriving already signed in; a fresh login navigates in onSuccess.
  useEffect(() => { if (useAuth.getState().token) router.replace(returnTo()); }, [router]);
  if (token) return null;

  return (
    <AuthShell>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="w-full space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">SMART Traffic Light</h1>
            <p className="text-sm text-slate-400">LGU Monitoring Dashboard</p>
          </div>
        </div>
        <label className="block text-sm">
          Username
          <input required autoFocus autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={cx(input, 'mt-1 w-full')} />
        </label>
        <label className="block text-sm">
          Password
          <input required type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={cx(input, 'mt-1 w-full')} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
          Remember me
        </label>
        {m.isError && <p role="alert" className="text-sm text-red-400">{m.error.message}</p>}
        <button type="submit" disabled={m.isPending} className={cx(btnPrimary, 'w-full')}>{m.isPending ? 'Signing in…' : 'Sign in'}</button>
        {USE_MOCKS && (
          <p className="text-xs text-slate-500">Demo accounts: <b>admin</b>, <b>operator</b>, <b>viewer</b> — password <b>password</b></p>
        )}
        <p className="text-center text-sm text-slate-400">No account yet? <Link href="/register" className="text-sky-300 hover:underline">Create one</Link></p>
      </form>
    </AuthShell>
  );
}

import { create } from 'zustand';
import { qc } from '../services/queryClient';
import type { Role, User } from '../types';

const KEY = 'stl-auth';
const read = (): { token: string; user: User } | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};

// shortcut: readable role cookie, not the JWT; switch to an httpOnly JWT cookie set by the Express backend.
const ROLE_COOKIE = 'stl-role';
function setRoleCookie(user: User | null, remember = true) {
  if (typeof document === 'undefined') return;
  document.cookie = user
    ? `${ROLE_COOKIE}=${user.role}; path=/; SameSite=Lax${remember ? '; max-age=2592000' : ''}`
    : `${ROLE_COOKIE}=; path=/; max-age=0`;
}

interface AuthState {
  token: string | null;
  user: User | null;
  login: (token: string, user: User, remember: boolean) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()((set) => ({
  token: read()?.token ?? null,
  user: read()?.user ?? null,
  login: (token, user, remember) => {
    try {
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify({ token, user }));
    } catch { /* storage blocked: session lasts until reload */ }
    setRoleCookie(user, remember);
    set({ token, user });
  },
  logout: () => {
    try {
      localStorage.removeItem(KEY);
      sessionStorage.removeItem(KEY);
    } catch { /* nothing stored */ }
    setRoleCookie(null);
    set({ token: null, user: null });
    qc.clear();
  },
}));

// Sessions saved before the cookie existed (or with it cleared) get it back, so middleware doesn't bounce them to /login.
setRoleCookie(useAuth.getState().user);

export const OPS: Role[] = ['ADMIN', 'OPERATOR'];
export const ADMIN: Role[] = ['ADMIN'];
export const useCan = (roles: Role[]) => useAuth((s) => !!s.user && roles.includes(s.user.role));

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import AppShell from '../../components/AppShell';
import { useAuth } from '../../store/auth';

/** middleware.ts handles redirects up front; this catches a token that's gone (logout, cleared storage). */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!token) {
      useAuth.getState().logout();
      router.replace(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [token, router, pathname]);
  return token ? <AppShell>{children}</AppShell> : null;
}

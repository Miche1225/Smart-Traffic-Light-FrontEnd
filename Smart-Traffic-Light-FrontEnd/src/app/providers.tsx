'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { qc } from '../services/queryClient';
import { USE_MOCKS } from '../services/ws';

/**
 * Renders the app only in the browser, after the mocks are up: the views read window/localStorage
 * and talk to MSW, so there is nothing useful to server-render.
 */
export default function Providers({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Mocks run unless NEXT_PUBLIC_USE_MOCKS=false, so the whole UI works without a backend.
    if (!USE_MOCKS) return setReady(true);
    import('../mocks').then((m) => m.startMocks()).then(() => setReady(true));
  }, []);
  return ready ? <QueryClientProvider client={qc}>{children}</QueryClientProvider> : null;
}

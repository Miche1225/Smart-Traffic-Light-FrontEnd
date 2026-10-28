import { QueryClient } from '@tanstack/react-query';

export const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10_000 } },
});

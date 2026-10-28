import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../store/auth';
import type { Alert, Camera, HourlyTraffic, Intersection, UltrasonicSensor } from '../types';

const BASE = '/api/v1';

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (res.status === 401 && token) useAuth.getState().logout();
  if (!res.ok) {
    const message = (await res.json().catch(() => null))?.message;
    if (message) throw new Error(message);
    // No JSON message means the answer did not come from our API (the dev server's own 404 page, a proxy error, or an old backend).
    const hint = res.status === 404 ? ' - the API has no such route. Restart "npm run backend" and "npm run dev".' : res.status >= 500 ? ' - is "npm run backend" running?' : '';
    throw new Error(`Request failed (${res.status}) for ${(init.method ?? 'GET').toUpperCase()} ${BASE}${path}${hint}`);
  }
  return res.json();
}

/** Query string from the non-empty values. */
export function qs(o: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const useIntersections = () =>
  useQuery({ queryKey: ['intersections'], queryFn: () => api<Intersection[]>('/intersections'), refetchInterval: 5000 });
export const useCameras = (intersectionId?: string) =>
  useQuery({ queryKey: ['cameras', intersectionId ?? 'all'], queryFn: () => api<Camera[]>(`/cameras${qs({ intersectionId })}`) });
export const useSensors = (intersectionId?: string) =>
  useQuery({ queryKey: ['sensors', intersectionId ?? 'all'], queryFn: () => api<UltrasonicSensor[]>(`/sensors${qs({ intersectionId })}`) });
export const hourlyQuery = (intersectionId: string, date: string) => ({
  queryKey: ['hourly', intersectionId, date],
  queryFn: () => api<HourlyTraffic[]>(`/traffic/hourly${qs({ intersectionId, date })}`),
  refetchInterval: 60_000,
});
export const useHourly = (intersectionId: string, date: string) => useQuery(hourlyQuery(intersectionId, date));
export const useAlerts = (filters: Record<string, string | undefined> = {}) =>
  useQuery({ queryKey: ['alerts', filters], queryFn: () => api<Alert[]>(`/alerts${qs(filters)}`) });

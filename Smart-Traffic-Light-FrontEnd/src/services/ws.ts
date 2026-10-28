import { laneKey, pushToast, useLive } from '../store/live';
import type { Camera, DashboardKpi, WsEvent } from '../types';
import { api } from './api';
import { startCameraSim } from './cameraSim';
import { qc } from './queryClient';

/** NEXT_PUBLIC_USE_MOCKS=true runs the whole UI on in-browser fake data (no backend). Default: the real Express + MySQL API. */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
/** NEXT_PUBLIC_LIVE_WS=true connects to a WebSocket server at /ws (for a later live-feed service). */
const LIVE_WS = process.env.NEXT_PUBLIC_LIVE_WS === 'true';

/** Intersections a connected Arduino is driving; the mock feed skips them so the two don't fight. */
export const arduinoOwned = new Set<string>();
const arduinoDriven = (e: WsEvent) => 'intersectionId' in e.data && arduinoOwned.has(e.data.intersectionId as string);

export function handleEvent(e: WsEvent) {
  const set = useLive.setState;
  switch (e.event) {
    case 'detection.frame': set((s) => ({ frames: { ...s.frames, [e.data.cameraId]: e.data } })); break;
    case 'signal.state': set((s) => ({ signals: { ...s.signals, [e.data.intersectionId]: e.data } })); break;
    case 'lane.status': set((s) => ({ lanes: { ...s.lanes, [laneKey(e.data)]: e.data } })); break;
    case 'sensor.reading':
      set((s) => {
        const k = Object.keys(s.lanes).find((key) => s.lanes[key].sensor.sensorId === e.data.sensorId);
        return k ? { lanes: { ...s.lanes, [k]: { ...s.lanes[k], sensor: e.data } } } : {};
      });
      break;
    case 'dashboard.kpi': set({ kpi: e.data }); break;
    case 'device.status':
      set((s) => ({ devices: { ...s.devices, [e.data.id]: e.data } }));
      qc.invalidateQueries({ queryKey: [e.data.kind === 'camera' ? 'cameras' : 'sensors'] });
      qc.invalidateQueries({ queryKey: ['intersections'] });
      break;
    case 'violation.new':
      qc.invalidateQueries({ queryKey: ['violations'] });
      pushToast('info', `Over-speeding: ${e.data.vehicleType} at ${e.data.speedKph} km/h (limit ${e.data.limitKph}) — ${e.data.intersectionName}`);
      break;
    case 'alert.new':
      qc.invalidateQueries({ queryKey: ['alerts'] });
      if (e.data.severity === 'CRITICAL') pushToast('critical', e.data.message);
      break;
  }
}

const channels = new Set(['dashboard', 'alerts']);
let socket: WebSocket | null = null;

/** Add channels (e.g. `intersection:INT-001`, `camera:CAM-001-1`); re-sent on every reconnect. */
export function subscribe(list: string[]) {
  const fresh = list.filter((c) => !channels.has(c));
  fresh.forEach((c) => channels.add(c));
  if (fresh.length && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ action: 'subscribe', channels: fresh }));
}

/** Connect the live feed; returns a disconnect function. Reconnects with exponential backoff. */
export function connectLive(token: string) {
  if (USE_MOCKS) {
    useLive.setState({ ws: 'open' });
    let off: (() => void) | undefined;
    let dead = false;
    import('../mocks').then((m) => { if (!dead) off = m.onMockEvent((e) => { if (!arduinoDriven(e)) handleEvent(e); }); });
    return () => { dead = true; off?.(); };
  }

  if (!LIVE_WS) return connectPolling();

  let retry = 0;
  let timer = 0;
  let stopped = false;
  const open = () => {
    const ws = (socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token)}`));
    ws.onopen = () => {
      retry = 0;
      useLive.setState({ ws: 'open' });
      ws.send(JSON.stringify({ action: 'subscribe', channels: [...channels] }));
    };
    ws.onmessage = (m) => {
      try { handleEvent(JSON.parse(m.data)); } catch { /* ignore malformed message */ }
    };
    ws.onclose = () => {
      if (stopped) return;
      useLive.setState({ ws: 'reconnecting' });
      timer = window.setTimeout(open, Math.min(30_000, 1000 * 2 ** retry++));
    };
  };
  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
    socket = null;
  };
}

/**
 * Real-API mode without a WebSocket server: every 10 s check the API is up and refresh the headline numbers
 * (the top bar turns "Offline" and shows the reconnecting banner if the backend stops answering).
 * Camera boxes in the Live View come from the on-screen simulation in cameraSim.ts.
 */
function connectPolling() {
  let stopped = false;
  let cams: Pick<Camera, 'id' | 'status'>[] = [];
  let tick = 0;
  const poll = async () => {
    try {
      const health = await fetch('/api/v1/health');
      if (!health.ok) throw new Error('API down');
      if (stopped) return;
      useLive.setState({ ws: 'open', kpi: await api<DashboardKpi>('/dashboard/summary') });
      cams = await api<Camera[]>('/cameras');
      if (tick++ % 2 === 1) {
        qc.invalidateQueries({ queryKey: ['alerts'] });
        qc.invalidateQueries({ queryKey: ['violations'] });
      }
    } catch {
      if (!stopped) useLive.setState({ ws: 'reconnecting' });
    }
  };
  poll();
  const timer = setInterval(poll, 10_000);
  const stopSim = startCameraSim(() => cams, handleEvent);
  return () => { stopped = true; clearInterval(timer); stopSim(); };
}

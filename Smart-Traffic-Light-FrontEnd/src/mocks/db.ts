import type {
  Alert, AlertType, Camera, CongestionLevel, DailySummaryReport, DashboardKpi, Detection, DetectionFrame,
  DistanceLevel, HourlyTraffic, Intersection, LaneStatus, SensorReading, Severity, SignalState,
  UltrasonicSensor, User, VehicleType, Violation, ViolationStatus, WeeklyReport, WsEvent,
} from '../types';
import { addDays, APPROACHES, manilaDateOf, manilaHour, manilaToday, VEHICLE_COLORS } from '../utils/format';
import { peakStats } from '../utils/report';
import { AXIS, phasesOf, stepSignal, type Axis, type Ctl } from './signal';

// In-memory "backend": seed data plus a small simulation the REST handlers read and the fake WebSocket pushes.

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h; };
const noise = (key: string) => mulberry32(hash(key))();
const rng = mulberry32(20261022);
const pick = <T>(a: readonly T[]) => a[Math.floor(rng() * a.length)];
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const round1 = (n: number) => Math.round(n * 10) / 10;

// ---- events -------------------------------------------------------------
const listeners = new Set<(e: WsEvent) => void>();
export const onMockEvent = (fn: (e: WsEvent) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emit = (e: WsEvent) => listeners.forEach((fn) => fn(e));

// ---- seed ---------------------------------------------------------------
const MIX: [VehicleType, number][] = [
  ['motorcycle', 0.35], ['car', 0.25], ['tricycle', 0.15], ['jeepney', 0.1], ['van', 0.06], ['truck', 0.05], ['bus', 0.03], ['other', 0.01],
];
const pickType = (r: number): VehicleType => { let acc = 0; for (const [t, p] of MIX) if (r < (acc += p)) return t; return 'other'; };

const DEFS = [
  { id: 'INT-001', name: 'Main St – Rizal Ave', barangay: 'Poblacion', lat: 10.3157, lng: 123.8854, cams: 4, lanes: 2, scale: 1.3 },
  { id: 'INT-002', name: 'Mabini St – Bonifacio Ave', barangay: 'San Isidro', lat: 10.3201, lng: 123.8912, cams: 3, lanes: 1, scale: 0.9 },
  { id: 'INT-003', name: 'National Hwy – Market Rd', barangay: 'Santa Cruz', lat: 10.3089, lng: 123.8798, cams: 4, lanes: 2, scale: 1.6 },
  { id: 'INT-004', name: 'Plaza Junction', barangay: 'Poblacion', lat: 10.3172, lng: 123.8821, cams: 2, lanes: 1, scale: 0.7 },
];
const def = (id: string) => DEFS.find((d) => d.id === id)!;
export const findIntersection = (id: string) => intersections.find((i) => i.id === id);
const nameOf = (id: string) => findIntersection(id)!.name;

export const users: (User & { password: string })[] = [
  { id: 'U-1', username: 'admin', name: 'Admin User', role: 'ADMIN', password: 'password' },
  { id: 'U-2', username: 'operator', name: 'Traffic Operator', role: 'OPERATOR', password: 'password' },
  { id: 'U-3', username: 'viewer', name: 'LGU Official', role: 'VIEWER', password: 'password' },
];

export const intersections: Intersection[] = DEFS.map((d): Intersection => ({
  id: d.id, name: d.name, barangay: d.barangay, lat: d.lat, lng: d.lng, approaches: [...APPROACHES],
  mode: 'ADAPTIVE', status: 'ONLINE', congestion: 'LOW', speedLimitKph: 40,
}));

export const cameras: Camera[] = DEFS.flatMap((d) =>
  Array.from({ length: d.cams }, (_, i): Camera => ({
    id: `CAM-${d.id.slice(4)}-${i + 1}`, intersectionId: d.id, channel: i + 1, approach: APPROACHES[i % 4],
    name: `${d.name} Ch ${i + 1}`, streamUrl: '', streamType: 'HLS', resolution: '1920x1080', status: 'ONLINE', fps: 25, lastSeen: iso(),
  })),
);
export const sensors: UltrasonicSensor[] = DEFS.flatMap((d) =>
  APPROACHES.flatMap((a) =>
    Array.from({ length: d.lanes }, (_, l): UltrasonicSensor => ({
      id: `US-${d.id.slice(4)}-${a}${l + 1}`, intersectionId: d.id, approach: a, lane: l + 1, maxRangeM: 4.5,
      thresholds: { nearM: 1.5, midM: 3, farM: 4.5 }, status: 'ONLINE', lastSeen: iso(),
    })),
  ),
);
Object.assign(cameras[6], { status: 'OFFLINE', lastSeen: iso(52 * 60_000) });
Object.assign(sensors[5], { status: 'OFFLINE', lastSeen: iso(20 * 60_000) });

function refreshStatus() {
  for (const i of intersections) {
    const devs = [...cameras, ...sensors].filter((d) => d.intersectionId === i.id);
    i.status = devs.every((d) => d.status === 'OFFLINE') ? 'OFFLINE' : devs.some((d) => d.status !== 'ONLINE') ? 'DEGRADED' : 'ONLINE';
  }
}
refreshStatus();

// ---- hourly traffic (deterministic per intersection/date) --------------
const gauss = (h: number, mu: number, s: number) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
// PH pattern: AM peak 7–9, PM peak 5–7, bump at noon.
const weight = (h: number) => 12 + (h >= 5 && h <= 22 ? 35 : 0) + 130 * gauss(h, 8, 1.1) + 140 * gauss(h, 18, 1.2) + 50 * gauss(h, 12, 0.8);
const PEAK_WEIGHT = 230;

function splitByType(total: number) {
  const out: Partial<Record<VehicleType, number>> = {};
  let left = total;
  for (const [t, p] of MIX.slice(1)) left -= out[t] = Math.round(total * p);
  out.motorcycle = Math.max(0, left);
  return out;
}

function sumTypes(list: Partial<Record<VehicleType, number>>[]) {
  const out: Partial<Record<VehicleType, number>> = {};
  for (const by of list) for (const [t, n] of Object.entries(by) as [VehicleType, number][]) out[t] = (out[t] ?? 0) + n;
  return out;
}

export function hourlyFor(id: string, date: string): HourlyTraffic[] {
  if (id === 'ALL') {
    const all = DEFS.map((d) => hourlyFor(d.id, date));
    return all[0].map((_, h) => ({
      hour: h,
      total: all.reduce((s, x) => s + x[h].total, 0),
      byType: sumTypes(all.map((x) => x[h].byType)),
      avgSpeedKph: Math.round(all.reduce((s, x) => s + x[h].avgSpeedKph, 0) / all.length),
    }));
  }
  const d = def(id);
  const today = manilaToday();
  const curH = manilaHour();
  const frac = new Date().getMinutes() / 60; // Manila is a whole-hour offset, so local minutes match
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  return Array.from({ length: 24 }, (_, h) => {
    const n = noise(`${id}${date}${h}`);
    let total = Math.round(weight(h) * d.scale * (0.85 + 0.3 * n) * (weekend ? 0.8 : 1));
    if (date > today || (date === today && h > curH)) total = 0;
    else if (date === today && h === curH) total = Math.round(total * frac);
    return { hour: h, total, byType: splitByType(total), avgSpeedKph: Math.round(50 - weight(h) / 9 + n * 6) };
  });
}

// ---- lanes, sensors, signals --------------------------------------------
interface LaneSim { sensor: UltrasonicSensor; queue: VehicleType[]; departures: number[]; distanceM: number | null }
const laneSims: LaneSim[] = sensors.map((sensor) => ({ sensor, queue: [], departures: [], distanceM: null }));
const LEVELS: CongestionLevel[] = ['LOW', 'MODERATE', 'HEAVY', 'SEVERE'];
const density = (q: number): CongestionLevel => (q < 3 ? 'LOW' : q < 6 ? 'MODERATE' : q < 10 ? 'HEAVY' : 'SEVERE');
const ctls: Record<string, Ctl> = Object.fromEntries(
  DEFS.map((d, i) => [d.id, { axis: i % 2 ? 'EW' : 'NS', stage: 'GREEN', remaining: 8 + i * 5 } satisfies Ctl]),
);

function greenFor(id: string, axis: Axis) {
  if (findIntersection(id)!.mode === 'FIXED') return 25;
  const q = Math.max(0, ...laneSims.filter((l) => l.sensor.intersectionId === id && AXIS[l.sensor.approach] === axis).map((l) => l.queue.length));
  return Math.min(45, Math.max(12, 10 + q * 3));
}

export const signalOf = (id: string): SignalState => ({
  intersectionId: id, phases: phasesOf(ctls[id], (a) => greenFor(id, a)), mode: findIntersection(id)!.mode, updatedAt: iso(),
});

function readingOf(l: LaneSim): SensorReading {
  const off = l.sensor.status === 'OFFLINE';
  const d = off ? null : l.distanceM;
  const t = l.sensor.thresholds;
  const level: DistanceLevel = d == null ? 'NONE' : d <= t.nearM ? 'NEAR' : d <= t.midM ? 'MID' : d <= t.farM ? 'FAR' : 'NONE';
  return { sensorId: l.sensor.id, timestamp: iso(), vehiclePresent: d != null, distanceM: d, distanceLevel: level, countLast5Min: off ? 0 : l.departures.length };
}

export const lanes = (intersectionId?: string): LaneStatus[] =>
  laneSims
    .filter((l) => !intersectionId || l.sensor.intersectionId === intersectionId)
    .map((l) => {
      const cameraCounts: Partial<Record<VehicleType, number>> = {};
      for (const t of l.queue) cameraCounts[t] = (cameraCounts[t] ?? 0) + 1;
      return {
        intersectionId: l.sensor.intersectionId, approach: l.sensor.approach, lane: l.sensor.lane,
        queueLength: l.queue.length, density: density(l.queue.length), sensor: readingOf(l), cameraCounts,
      };
    });

/** One simulated second: arrivals, departures on green, signal step, congestion. */
export function tickSecond() {
  const now = Date.now();
  const w = weight(manilaHour()) / PEAK_WEIGHT;
  for (const l of laneSims) {
    const id = l.sensor.intersectionId;
    const c = ctls[id];
    if (rng() < Math.min(0.9, w * def(id).scale * 0.55)) l.queue.push(pickType(rng()));
    if (c.stage === 'GREEN' && AXIS[l.sensor.approach] === c.axis) {
      for (let k = rng() < 0.5 ? 2 : 1; k > 0 && l.queue.length; k--) { l.queue.shift(); l.departures.push(now); }
    }
    if (l.queue.length > 15) l.queue.length = 15;
    l.departures = l.departures.filter((t) => now - t < 300_000);
    l.distanceM = l.queue.length ? round1(0.4 + rng()) : rng() < 0.3 ? round1(1.6 + rng() * 2.8) : null;
    if (l.sensor.status !== 'OFFLINE') l.sensor.lastSeen = iso();
  }
  for (const i of intersections) {
    stepSignal(ctls[i.id], i.mode, (a) => greenFor(i.id, a));
    const worst = Math.max(0, ...laneSims.filter((l) => l.sensor.intersectionId === i.id).map((l) => LEVELS.indexOf(density(l.queue.length))));
    i.congestion = LEVELS[worst];
  }
}

// ---- detection tracks (per camera) --------------------------------------
type Track = Detection & { vy: number };
const tracks: Record<string, Track[]> = {};
let nextTrack = 1;
const SIZE: Record<VehicleType, [number, number]> = {
  motorcycle: [0.05, 0.09], bicycle: [0.04, 0.08], tricycle: [0.08, 0.11], car: [0.11, 0.13], van: [0.12, 0.15],
  jeepney: [0.13, 0.18], bus: [0.15, 0.24], truck: [0.15, 0.22], other: [0.08, 0.1],
};

export function tickFrames(): DetectionFrame[] {
  return cameras.filter((c) => c.status !== 'OFFLINE').map((cam) => {
    const list = (tracks[cam.id] = (tracks[cam.id] ?? []).filter((t) => t.bbox[1] < 1));
    for (const t of list) t.bbox[1] += t.vy;
    if (list.length < 8 && rng() < 0.12) {
      const type = pickType(rng());
      const [w, h] = SIZE[type];
      const speedKph = rng() < 0.05 ? 45 + rng() * 30 : 15 + rng() * 30;
      list.push({ trackId: nextTrack++, type, confidence: round1(0.55 + rng() * 0.44), bbox: [0.25 + rng() * (0.5 - w), -h, w, h], speedKph: Math.round(speedKph), vy: speedKph / 1500 });
    }
    const detections = list.filter((t) => t.bbox[1] + t.bbox[3] > 0).map(({ vy: _vy, ...d }) => ({ ...d, bbox: [...d.bbox] as Detection['bbox'] }));
    const countsByType: Partial<Record<VehicleType, number>> = {};
    for (const d of detections) countsByType[d.type] = (countsByType[d.type] ?? 0) + 1;
    return { cameraId: cam.id, timestamp: iso(), detections, countsByType };
  });
}

// ---- violations ---------------------------------------------------------
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const plate = () => `${pick([...LETTERS])}${pick([...LETTERS])}${pick([...LETTERS])} ${Math.floor(1000 + rng() * 9000)}`;

// Placeholder evidence image; a real backend serves camera snapshots.
function snapshot(type: VehicleType, speed: number, cam: string, at: string, shift: number) {
  const x = 220 + shift * 40;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
<rect width='640' height='360' fill='#1e293b'/><path d='M180 0 L460 0 L640 360 L0 360 Z' fill='#334155'/>
<path d='M320 0 L320 360' stroke='#e2e8f0' stroke-dasharray='18 18' stroke-width='3'/>
<rect x='${x}' y='${150 + shift * 30}' width='170' height='110' rx='12' fill='#64748b'/>
<rect x='${x - 6}' y='${144 + shift * 30}' width='182' height='122' fill='none' stroke='${VEHICLE_COLORS[type]}' stroke-width='4'/>
<rect x='${x - 6}' y='${120 + shift * 30}' width='182' height='24' fill='${VEHICLE_COLORS[type]}'/>
<text x='${x}' y='${138 + shift * 30}' font-family='monospace' font-size='15' fill='#fff'>${type} ${speed} km/h</text>
<text x='12' y='344' font-family='monospace' font-size='14' fill='#e2e8f0'>${cam}  ${at}  FRAME ${shift + 1}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

let vioSeq = 0;
function makeViolation(at: Date, status: ViolationStatus): Violation {
  const cam = pick(cameras);
  const int = findIntersection(cam.intersectionId)!;
  const type = pickType(rng());
  const speedKph = int.speedLimitKph + 5 + Math.round(rng() * 35);
  const stamp = at.toISOString();
  return {
    id: `VIO-${String(++vioSeq).padStart(5, '0')}`, timestamp: stamp, intersectionId: int.id, intersectionName: int.name,
    cameraId: cam.id, approach: cam.approach, lane: 1 + Math.floor(rng() * def(int.id).lanes), vehicleType: type,
    speedKph, limitKph: int.speedLimitKph, plateNumber: rng() < 0.7 ? plate() : null, confidence: Math.round((0.6 + rng() * 0.39) * 100) / 100,
    imageUrl: snapshot(type, speedKph, cam.id, stamp, 0), extraFrames: [snapshot(type, speedKph, cam.id, stamp, 1), snapshot(type, speedKph, cam.id, stamp, 2)],
    status, audit: [{ at: stamp, by: 'System', action: 'Captured by speed detection' }],
  };
}
const STATUSES: ViolationStatus[] = ['NEW', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED', 'ISSUED'];
export const violations: Violation[] = Array.from({ length: 30 }, () => makeViolation(new Date(Date.now() - rng() * 7 * 864e5), pick(STATUSES)))
  .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
export const isStatus = (s: unknown): s is ViolationStatus => STATUSES.includes(s as ViolationStatus);

// ---- alerts -------------------------------------------------------------
let alertSeq = 0;
export const alerts: Alert[] = [];
export function pushAlert(type: AlertType, severity: Severity, message: string, intersectionId?: string, refId?: string, at = iso(), acknowledged = false) {
  const a: Alert = { id: `ALR-${String(++alertSeq).padStart(5, '0')}`, type, severity, message, intersectionId, refId, timestamp: at, acknowledged };
  alerts.unshift(a);
  alerts.sort((x, y) => y.timestamp.localeCompare(x.timestamp));
  if (!acknowledged) emit({ event: 'alert.new', data: a });
  return a;
}
for (const v of violations.slice(0, 6)) pushAlert('OVERSPEED', 'WARNING', `${v.vehicleType} at ${v.speedKph} km/h (limit ${v.limitKph}) — ${v.intersectionName}`, v.intersectionId, v.id, v.timestamp, true);
pushAlert('CAMERA_OFFLINE', 'CRITICAL', `${cameras[6].name} went offline`, cameras[6].intersectionId, cameras[6].id, cameras[6].lastSeen);
pushAlert('SENSOR_FAULT', 'WARNING', `Ultrasonic sensor ${sensors[5].id} not responding`, sensors[5].intersectionId, sensors[5].id, sensors[5].lastSeen);
pushAlert('HEAVY_CONGESTION', 'WARNING', `Heavy congestion at ${DEFS[2].name}`, DEFS[2].id, undefined, iso(3 * 3600_000), true);
pushAlert('SIGNAL_FAULT', 'CRITICAL', `Signal controller timeout at ${DEFS[1].name} (recovered)`, DEFS[1].id, undefined, iso(9 * 3600_000), true);

// ---- random live events -------------------------------------------------
const lastCongestionAlert: Record<string, number> = {};
export function randomEvent() {
  const r = rng();
  if (r < 0.45) {
    const v = makeViolation(new Date(), 'NEW');
    violations.unshift(v);
    emit({ event: 'violation.new', data: v });
    pushAlert('OVERSPEED', 'WARNING', `${v.vehicleType} at ${v.speedKph} km/h (limit ${v.limitKph}) — ${v.intersectionName}`, v.intersectionId, v.id);
  } else if (r < 0.6) {
    const dev = pick<Camera | UltrasonicSensor>([...cameras, ...sensors]);
    const offline = [...cameras, ...sensors].filter((d) => d.status === 'OFFLINE').length;
    if (dev.status === 'ONLINE' && offline >= 3) return;
    dev.status = dev.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE';
    dev.lastSeen = iso();
    refreshStatus();
    const kind = 'channel' in dev ? 'camera' : 'sensor';
    emit({ event: 'device.status', data: { id: dev.id, kind, status: dev.status, lastSeen: dev.lastSeen } });
    if (dev.status === 'OFFLINE')
      pushAlert(kind === 'camera' ? 'CAMERA_OFFLINE' : 'SENSOR_FAULT', kind === 'camera' ? 'CRITICAL' : 'WARNING',
        kind === 'camera' ? `${(dev as Camera).name} went offline` : `Ultrasonic sensor ${dev.id} not responding`, dev.intersectionId, dev.id);
  } else {
    const hot = intersections.find((i) => (i.congestion === 'HEAVY' || i.congestion === 'SEVERE') && Date.now() - (lastCongestionAlert[i.id] ?? 0) > 120_000);
    if (!hot) return;
    lastCongestionAlert[hot.id] = Date.now();
    pushAlert('HEAVY_CONGESTION', hot.congestion === 'SEVERE' ? 'CRITICAL' : 'WARNING', `${hot.congestion === 'SEVERE' ? 'Severe' : 'Heavy'} congestion at ${hot.name}`, hot.id);
  }
}

// ---- KPIs & reports ------------------------------------------------------
const total = (h: HourlyTraffic[], upTo = 23) => h.slice(0, upTo + 1).reduce((s, x) => s + x.total, 0);

export function kpi(): DashboardKpi {
  const today = manilaToday();
  const curH = manilaHour();
  const frac = new Date().getMinutes() / 60;
  const y = hourlyFor('ALL', addDays(today, -1));
  const perInt = intersections.map((i) => ({ id: i.id, name: i.name, perMin: round1(hourlyFor(i.id, today)[curH].total / Math.max(1, frac * 60)) }));
  const todays = violations.filter((v) => manilaDateOf(v.timestamp) === today);
  const offline = cameras.filter((c) => c.status === 'OFFLINE');
  return {
    vehiclesToday: total(hourlyFor('ALL', today)),
    vehiclesYesterdaySameTime: total(y, curH - 1) + Math.round(y[curH].total * frac),
    peakIntersection: perInt.sort((a, b) => b.perMin - a.perMin)[0],
    overspeedToday: todays.length,
    lastOverspeedAt: todays[0]?.timestamp ?? null,
    camerasOnline: cameras.length - offline.length,
    camerasTotal: cameras.length,
    offlineCameras: offline.map((c) => c.name),
    sensorsOnline: sensors.filter((s) => s.status !== 'OFFLINE').length,
    sensorsTotal: sensors.length,
    avgWaitSec: Math.round(laneSims.reduce((s, l) => s + 6 + l.queue.length * 2.5, 0) / laneSims.length),
  };
}

export function dailyReport(date: string, scope: string): DailySummaryReport {
  const ids = scope === 'ALL' ? DEFS.map((d) => d.id) : [scope];
  const per = ids.map((id) => ({ intersectionId: id, name: nameOf(id), hourly: hourlyFor(id, date) }));
  const hourly = hourlyFor(scope, date);
  const vs = violations.filter((v) => manilaDateOf(v.timestamp) === date && ids.includes(v.intersectionId));
  const waits = ids.map((id) => ({ intersectionId: id, name: nameOf(id), avgWaitSec: Math.round(20 + noise(`${id}${date}w`) * 25 * def(id).scale) }));
  return {
    date, intersectionId: scope, totalVehicles: total(hourly),
    ...peakStats(hourly.map((h) => h.total), date === manilaToday() ? manilaHour() : 23),
    byType: sumTypes(hourly.map((h) => h.byType)), hourly,
    heatmap: per.map((p) => ({ intersectionId: p.intersectionId, name: p.name, hourly: p.hourly.map((h) => h.total) })),
    overspeedCount: vs.length,
    topViolationLocations: ids
      .map((id) => ({ intersectionId: id, name: nameOf(id), count: vs.filter((v) => v.intersectionId === id).length }))
      .filter((l) => l.count).sort((a, b) => b.count - a.count).slice(0, 3),
    avgWaitSec: Math.round(waits.reduce((s, w) => s + w.avgWaitSec, 0) / waits.length),
    avgWaitByIntersection: waits,
    deviceUptimePct: round1(97 + noise(`${scope}${date}u`) * 2.9),
  };
}

export const weeklyReport = (start: string, scope: string): WeeklyReport => ({
  start, intersectionId: scope,
  days: Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, hourly: hourlyFor(scope, date).map((h) => h.total) }; }),
});

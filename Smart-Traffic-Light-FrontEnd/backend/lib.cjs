// Helpers shared by the API: dates (Asia/Manila), ids, the hourly traffic model, signal timing and evidence images.

// ---- dates ---------------------------------------------------------------
// The LGU works in Asia/Manila (UTC+8, no daylight saving). The database stores UTC.
const MANILA_MS = 8 * 3600e3;

/** JS date -> 'YYYY-MM-DD HH:MM:SS.mmm' (UTC), the format MySQL DATETIME(3) accepts. */
const sqlDate = (d = new Date()) => new Date(d).toISOString().replace('T', ' ').replace('Z', '');
/** MySQL DATETIME string (UTC) -> ISO string. */
const iso = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(`${String(v).replace(' ', 'T')}Z`).toISOString());

const manilaToday = (d = new Date()) => new Date(+d + MANILA_MS).toISOString().slice(0, 10);
const manilaHour = (d = new Date()) => new Date(+d + MANILA_MS).getUTCHours();
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** The instant (UTC) a Manila calendar day begins. */
const manilaDayStart = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - MANILA_MS);
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// ---- ids -----------------------------------------------------------------
const pad = (n, w) => String(n).padStart(w, '0');
const fmtId = (prefix, n, w = 5) => `${prefix}-${pad(n, w)}`;
/** 'VIO-00012' -> 12 (null if it is not a valid id of that kind). */
const parseId = (prefix, s) => {
  const m = new RegExp(`^${prefix}-(\\d{1,9})$`).exec(String(s));
  return m ? Number(m[1]) : null;
};

// ---- small deterministic randomness (same numbers every run) ---------------
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h;
};
const noise = (key) => mulberry32(hash(key))();
const round1 = (n) => Math.round(n * 10) / 10;

// ---- vehicles --------------------------------------------------------------
const VEHICLE_TYPES = ['motorcycle', 'car', 'tricycle', 'jeepney', 'van', 'truck', 'bus', 'bicycle', 'other'];
const VEHICLE_COLORS = {
  car: '#3b82f6', motorcycle: '#a855f7', tricycle: '#ec4899', jeepney: '#f59e0b', bus: '#10b981',
  truck: '#ef4444', van: '#06b6d4', bicycle: '#84cc16', other: '#94a3b8',
};
const MIX = [['motorcycle', 0.35], ['car', 0.25], ['tricycle', 0.15], ['jeepney', 0.1], ['van', 0.06], ['truck', 0.05], ['bus', 0.03], ['other', 0.01]];
const pickType = (r) => {
  let acc = 0;
  for (const [t, p] of MIX) if (r < (acc += p)) return t;
  return 'other';
};

// ---- hourly traffic model ------------------------------------------------------
// Until the cameras feed real counts, hours are generated from a typical Philippine day (AM peak 7-9, PM peak 5-7,
// noon bump), scaled per intersection, and then STORED in MySQL so every page reads the same numbers.
const gauss = (h, mu, s) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
const weight = (h) => 12 + (h >= 5 && h <= 22 ? 35 : 0) + 130 * gauss(h, 8, 1.1) + 140 * gauss(h, 18, 1.2) + 50 * gauss(h, 12, 0.8);

function splitByType(total) {
  const out = {};
  let left = total;
  for (const [t, p] of MIX.slice(1)) left -= out[t] = Math.round(total * p);
  out.motorcycle = Math.max(0, left);
  return out;
}
function sumTypes(list) {
  const out = {};
  for (const by of list) for (const [t, n] of Object.entries(by)) out[t] = (out[t] ?? 0) + n;
  return out;
}

/** Model value for one hour of one day at one intersection. */
function modelHour(intersectionId, scale, date, h) {
  const n = noise(`${intersectionId}${date}${h}`);
  const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const total = Math.round(weight(h) * scale * (0.85 + 0.3 * n) * (weekend ? 0.8 : 1));
  return { total, avgSpeedKph: Math.round(50 - weight(h) / 9 + n * 6) };
}

/** Peak, top-3 and quietest hour from 24 hourly totals; hours after `lastHour` are ignored. */
function peakStats(totals, lastHour = 23) {
  const hours = totals.slice(0, lastHour + 1).map((count, hour) => ({ hour, count }));
  const sorted = [...hours].sort((a, b) => b.count - a.count || a.hour - b.hour);
  return { peakHour: sorted[0], top3Hours: sorted.slice(0, 3), quietestHour: sorted[sorted.length - 1] };
}

// ---- signal timing ---------------------------------------------------------------
// A software two-phase cycle (N/S then E/W) so the dashboard has something to show without hardware.
const AXIS = { N: 'NS', S: 'NS', E: 'EW', W: 'EW' };
const GREEN = 25, YELLOW = 3, ALLRED = 2;
const other = (a) => (a === 'NS' ? 'EW' : 'NS');

/** Where in the cycle an intersection is right now. */
function signalCtl(id, now = Date.now()) {
  const cycle = 2 * (GREEN + YELLOW + ALLRED);
  const t = (Math.floor(now / 1000) + hash(id)) % cycle;
  const half = cycle / 2;
  const axis = t < half ? 'NS' : 'EW';
  const k = t % half;
  if (k < GREEN) return { axis, stage: 'GREEN', remaining: GREEN - k };
  if (k < GREEN + YELLOW) return { axis, stage: 'YELLOW', remaining: GREEN + YELLOW - k };
  return { axis, stage: 'ALLRED', remaining: half - k };
}
function phasesOf(c) {
  const next = other(c.axis);
  return ['N', 'S', 'E', 'W'].map((approach) => {
    const ax = AXIS[approach];
    if (c.stage === 'ALLRED')
      return { approach, color: 'RED', remainingSec: ax === next ? c.remaining : c.remaining + GREEN + YELLOW + ALLRED };
    if (ax === c.axis) return { approach, color: c.stage, remainingSec: c.remaining };
    return { approach, color: 'RED', remainingSec: c.remaining + (c.stage === 'GREEN' ? YELLOW : 0) + ALLRED };
  });
}

// ---- evidence image ------------------------------------------------------------------
/** Placeholder evidence picture (an SVG data URL). Real snapshots will come from the cameras. */
function snapshot(type, speed, cam, at, shift) {
  const x = 220 + shift * 40;
  const color = VEHICLE_COLORS[type] ?? VEHICLE_COLORS.other;
  const label = `${String(type).replace(/[<>&'"]/g, '')} ${Math.round(speed)} km/h`;
  const foot = `${String(cam ?? 'manual entry').replace(/[<>&'"]/g, '')}  ${String(at).replace(/[<>&'"]/g, '')}  FRAME ${shift + 1}`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
<rect width='640' height='360' fill='#1e293b'/><path d='M180 0 L460 0 L640 360 L0 360 Z' fill='#334155'/>
<path d='M320 0 L320 360' stroke='#e2e8f0' stroke-dasharray='18 18' stroke-width='3'/>
<rect x='${x}' y='${150 + shift * 30}' width='170' height='110' rx='12' fill='#64748b'/>
<rect x='${x - 6}' y='${144 + shift * 30}' width='182' height='122' fill='none' stroke='${color}' stroke-width='4'/>
<rect x='${x - 6}' y='${120 + shift * 30}' width='182' height='24' fill='${color}'/>
<text x='${x}' y='${138 + shift * 30}' font-family='monospace' font-size='15' fill='#fff'>${label}</text>
<text x='12' y='344' font-family='monospace' font-size='14' fill='#e2e8f0'>${foot}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

module.exports = {
  sqlDate, iso, manilaToday, manilaHour, addDays, manilaDayStart, isDate,
  fmtId, parseId, mulberry32, hash, noise, round1,
  VEHICLE_TYPES, VEHICLE_COLORS, MIX, pickType,
  weight, splitByType, sumTypes, modelHour, peakStats,
  AXIS, signalCtl, phasesOf, snapshot,
};

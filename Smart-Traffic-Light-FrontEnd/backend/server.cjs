// SMART Traffic Light - Express API backed by MySQL.
//   npm run backend      start the API on http://127.0.0.1:4000  (creates the database + tables on first run)
//   npm run db:init      only create/seed the database, then exit
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');

const db = require('./db.cjs');
const L = require('./lib.cjs');
const { seedSampleData } = require('./seed.cjs');

const PORT = Number(process.env.PORT) || 4000;
const VERSION = (() => { try { return require('../package.json').version; } catch { return 'unknown'; } })();
const ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'];
const OPS = ['ADMIN', 'OPERATOR'];
const APPROACHES = ['N', 'S', 'E', 'W'];
const MODES = ['ADAPTIVE', 'FIXED', 'MANUAL'];
const DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'DEGRADED'];
const STREAM_TYPES = ['HLS', 'MJPEG', 'WEBRTC'];
const VIOLATION_STATUSES = ['NEW', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED', 'ISSUED'];
const ALERT_TYPES = ['OVERSPEED', 'CAMERA_OFFLINE', 'SENSOR_FAULT', 'HEAVY_CONGESTION', 'SIGNAL_FAULT'];
const SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'];
const PLATE = /^[A-Z0-9 -]{2,12}$/;

// ---- errors & validation ---------------------------------------------------------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const notFound = (what) => new HttpError(404, `${what} not found`);

/** Text field. Missing -> undefined (or an error if required). */
function str(v, label, { min = 0, max = 100, required = false } = {}) {
  if (v === undefined || v === null) {
    if (required) throw bad(`${label} is required`);
    return undefined;
  }
  if (typeof v !== 'string') throw bad(`${label} must be text`);
  const s = v.trim();
  if (s.length < min || s.length > max || (required && !s.length)) throw bad(`${label} must be ${Math.max(min, required ? 1 : 0)}–${max} characters`);
  return s;
}
function num(v, label, { min = -Infinity, max = Infinity, int = false, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${label} is required`);
    return undefined;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) throw bad(`${label} must be ${int ? 'a whole ' : 'a '}number from ${min} to ${max}`);
  return n;
}
function oneOf(v, label, list, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${label} is required`);
    return undefined;
  }
  if (!list.includes(v)) throw bad(`${label} must be one of: ${list.join(', ')}`);
  return v;
}
const defined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** Build and run "UPDATE table SET a=?, b=? WHERE ..." from the fields that were sent. */
async function update(table, fields, where, whereParams) {
  const keys = Object.keys(fields);
  if (!keys.length) throw bad('Nothing to update');
  await db.run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE ${where}`, [...keys.map((k) => fields[k]), ...whereParams]);
}

// ---- serializers (database row -> JSON the front end expects) --------------------------
const serUser = (r) => ({ id: L.fmtId('U', r.id, 3), username: r.username, name: r.name, role: r.role });
const nowIso = () => new Date().toISOString();

function deviceStatus(list) {
  if (!list.length) return 'OFFLINE';
  if (list.every((d) => d.status === 'OFFLINE')) return 'OFFLINE';
  return list.some((d) => d.status !== 'ONLINE') ? 'DEGRADED' : 'ONLINE';
}
function congestionOf(r) {
  const t = L.modelHour(r.id, r.traffic_scale, L.manilaToday(), L.manilaHour()).total;
  return t < 120 ? 'LOW' : t < 220 ? 'MODERATE' : t < 320 ? 'HEAVY' : 'SEVERE';
}
const serInt = (r, devices) => ({
  id: r.id, name: r.name, barangay: r.barangay, lat: r.lat, lng: r.lng, approaches: [...APPROACHES], mode: r.mode,
  status: deviceStatus(devices), congestion: congestionOf(r), speedLimitKph: r.speed_limit_kph,
});
// A stream address can carry a login (rtsp://user:pass@host/...): only administrators get it unchanged.
const hideLogin = (url) => url.replace(/\/\/[^/@]*@/, '//');
const serCam = (r, role = 'ADMIN') => ({
  id: r.id, intersectionId: r.intersection_id, channel: r.channel, approach: r.approach, name: r.name,
  streamUrl: role === 'ADMIN' ? r.stream_url : hideLogin(r.stream_url),
  streamType: r.stream_type, resolution: r.resolution, status: r.status, fps: r.fps,
  lastSeen: r.status === 'ONLINE' ? nowIso() : L.iso(r.last_seen), // an online device is "seen" right now
});
const serSensor = (r) => ({
  id: r.id, intersectionId: r.intersection_id, approach: r.approach, lane: r.lane, maxRangeM: r.max_range_m,
  thresholds: { nearM: r.near_m, midM: r.mid_m, farM: r.far_m }, status: r.status,
  lastSeen: r.status === 'ONLINE' ? nowIso() : L.iso(r.last_seen),
});
const serAlert = (r) => ({
  id: L.fmtId('ALR', r.id), type: r.type, severity: r.severity, intersectionId: r.intersection_id ?? undefined, message: r.message,
  timestamp: L.iso(r.ts), acknowledged: !!r.acknowledged, refId: r.ref_id ?? undefined,
});
const serViolation = (r, { audit = [], full = false } = {}) => ({
  id: L.fmtId('VIO', r.id), timestamp: L.iso(r.ts), intersectionId: r.intersection_id, intersectionName: r.intersection_name,
  cameraId: r.camera_id ?? '', approach: r.approach, lane: r.lane, vehicleType: r.vehicle_type, speedKph: r.speed_kph, limitKph: r.limit_kph,
  plateNumber: r.plate_number ?? null, confidence: r.confidence, imageUrl: r.image_url,
  extraFrames: full ? JSON.parse(r.extra_frames || '[]') : [], status: r.status, notes: r.notes ?? '',
  audit: audit.map((a) => ({ at: L.iso(a.happened_at), by: a.by_name, action: a.action })),
});
// Evidence (image, plate) is personal data under RA 10173: viewers never receive it.
const redact = (v, user) => (user.role === 'VIEWER' ? { ...v, imageUrl: '', extraFrames: [], plateNumber: null, audit: [] } : v);

// ---- data access -------------------------------------------------------------------------
const intersectionRows = () => db.query('SELECT * FROM intersections ORDER BY id');
async function intersectionById(id) {
  const [r] = await db.query('SELECT * FROM intersections WHERE id = ?', [id]);
  if (!r) throw notFound('Intersection');
  return r;
}
async function devicesOf(ids) {
  if (!ids.length) return new Map();
  const [cams, sens] = await Promise.all([
    db.query('SELECT intersection_id, status FROM cameras'),
    db.query('SELECT intersection_id, status FROM sensors'),
  ]);
  const m = new Map(ids.map((id) => [id, []]));
  for (const d of [...cams, ...sens]) m.get(d.intersection_id)?.push(d);
  return m;
}
async function intersectionJson(row) {
  return serInt(row, (await devicesOf([row.id])).get(row.id) ?? []);
}
async function nextId(table, prefix, width = 3) {
  const rows = await db.query(`SELECT id FROM ${table}`);
  const max = rows.reduce((m, r) => Math.max(m, L.parseId(prefix, r.id) ?? 0), 0);
  return L.fmtId(prefix, max + 1, width);
}

// ---- traffic model (stored in MySQL) ------------------------------------------------------------
async function dayHours(inter, date) {
  const today = L.manilaToday();
  const curH = L.manilaHour();
  const recent = date >= L.addDays(today, -400); // older days are not generated (keeps the table small)
  const lastDone = !recent ? -1 : date < today ? 23 : date === today ? curH - 1 : -1;
  const stored = new Map();
  if (lastDone >= 0) {
    const rows = await db.query('SELECT hour, total, by_type, avg_speed_kph FROM traffic_hourly WHERE intersection_id = ? AND day = ?', [inter.id, date]);
    for (const r of rows) stored.set(Number(r.hour), r);
  }
  const frac = new Date().getUTCMinutes() / 60; // Manila is a whole-hour offset, so the minutes match
  const out = [];
  const fresh = [];
  for (let h = 0; h < 24; h++) {
    const m = L.modelHour(inter.id, inter.traffic_scale, date, h);
    if (h <= lastDone) {
      const r = stored.get(h);
      if (r) {
        out.push({ hour: h, total: Number(r.total), byType: JSON.parse(r.by_type), avgSpeedKph: Number(r.avg_speed_kph) });
      } else {
        const byType = L.splitByType(m.total);
        fresh.push([inter.id, date, h, m.total, JSON.stringify(byType), m.avgSpeedKph]);
        out.push({ hour: h, total: m.total, byType, avgSpeedKph: m.avgSpeedKph });
      }
    } else if (recent && date === today && h === curH) {
      const total = Math.round(m.total * frac);
      out.push({ hour: h, total, byType: L.splitByType(total), avgSpeedKph: m.avgSpeedKph });
    } else {
      out.push({ hour: h, total: 0, byType: L.splitByType(0), avgSpeedKph: m.avgSpeedKph });
    }
  }
  if (fresh.length)
    await db.run(
      `INSERT IGNORE INTO traffic_hourly (intersection_id, day, hour, total, by_type, avg_speed_kph) VALUES ${fresh.map(() => '(?,?,?,?,?,?)').join(',')}`,
      fresh.flat(),
    );
  return out;
}

/** Hourly traffic for one intersection id or 'ALL'. */
async function hourlyFor(scope, date, rows) {
  const list = rows ?? (await intersectionRows());
  if (scope !== 'ALL') {
    const inter = list.find((i) => i.id === scope);
    if (!inter) throw notFound('Intersection');
    return dayHours(inter, date);
  }
  const all = await Promise.all(list.map((i) => dayHours(i, date)));
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    total: all.reduce((s, x) => s + x[h].total, 0),
    byType: L.sumTypes(all.map((x) => x[h].byType)),
    avgSpeedKph: all.length ? Math.round(all.reduce((s, x) => s + x[h].avgSpeedKph, 0) / all.length) : 0,
  }));
}
const sumTotal = (h, upTo = 23) => h.slice(0, upTo + 1).reduce((s, x) => s + x.total, 0);
const waitEstimate = (inter, date) => Math.round(20 + L.noise(`${inter.id}${date}w`) * 25 * inter.traffic_scale);

async function countViolations(from, to, ids) {
  if (!ids.length) return [];
  return db.query(
    `SELECT intersection_id, ts FROM violations WHERE ts >= ? AND ts < ? AND intersection_id IN (${ids.map(() => '?').join(',')}) ORDER BY ts DESC`,
    [L.sqlDate(L.manilaDayStart(from)), L.sqlDate(L.manilaDayStart(L.addDays(to, 1))), ...ids],
  );
}

async function kpi() {
  const today = L.manilaToday();
  const curH = L.manilaHour();
  const frac = new Date().getUTCMinutes() / 60;
  const ints = await intersectionRows();
  const [todayAll, yAll] = await Promise.all([hourlyFor('ALL', today, ints), hourlyFor('ALL', L.addDays(today, -1), ints)]);
  const perInt = await Promise.all(ints.map(async (i) => ({
    id: i.id, name: i.name, perMin: L.round1((await dayHours(i, today))[curH].total / Math.max(1, frac * 60)),
  })));
  const [cams, sens, vio] = await Promise.all([
    db.query('SELECT name, status FROM cameras'),
    db.query('SELECT status FROM sensors'),
    countViolations(today, today, ints.map((i) => i.id)),
  ]);
  const offline = cams.filter((c) => c.status === 'OFFLINE');
  return {
    vehiclesToday: sumTotal(todayAll),
    vehiclesYesterdaySameTime: sumTotal(yAll, curH - 1) + Math.round(yAll[curH].total * frac),
    peakIntersection: perInt.sort((a, b) => b.perMin - a.perMin)[0] ?? { id: '', name: '—', perMin: 0 },
    overspeedToday: vio.length,
    lastOverspeedAt: vio[0] ? L.iso(vio[0].ts) : null,
    camerasOnline: cams.length - offline.length,
    camerasTotal: cams.length,
    offlineCameras: offline.map((c) => c.name),
    sensorsOnline: sens.filter((s) => s.status !== 'OFFLINE').length,
    sensorsTotal: sens.length,
    avgWaitSec: ints.length ? Math.round(ints.reduce((s, i) => s + waitEstimate(i, today), 0) / ints.length) : 0,
  };
}

async function dailyReport(date, scope) {
  const ints = await intersectionRows();
  const picked = scope === 'ALL' ? ints : ints.filter((i) => i.id === scope);
  if (scope !== 'ALL' && !picked.length) throw notFound('Intersection');
  const per = await Promise.all(picked.map(async (i) => ({ intersectionId: i.id, name: i.name, hourly: await dayHours(i, date) })));
  const hourly = await hourlyFor(scope, date, ints);
  const vs = await countViolations(date, date, picked.map((i) => i.id));
  const waits = picked.map((i) => ({ intersectionId: i.id, name: i.name, avgWaitSec: waitEstimate(i, date) }));
  const [cams, sens] = await Promise.all([db.query('SELECT status FROM cameras'), db.query('SELECT status FROM sensors')]);
  const devices = [...cams, ...sens];
  return {
    date, intersectionId: scope, totalVehicles: sumTotal(hourly),
    ...L.peakStats(hourly.map((h) => h.total), date === L.manilaToday() ? L.manilaHour() : 23),
    byType: L.sumTypes(hourly.map((h) => h.byType)), hourly,
    heatmap: per.map((p) => ({ intersectionId: p.intersectionId, name: p.name, hourly: p.hourly.map((h) => h.total) })),
    overspeedCount: vs.length,
    topViolationLocations: picked
      .map((i) => ({ intersectionId: i.id, name: i.name, count: vs.filter((v) => v.intersection_id === i.id).length }))
      .filter((l) => l.count).sort((a, b) => b.count - a.count).slice(0, 3),
    avgWaitSec: waits.length ? Math.round(waits.reduce((s, w) => s + w.avgWaitSec, 0) / waits.length) : 0,
    avgWaitByIntersection: waits,
    deviceUptimePct: devices.length ? L.round1((devices.filter((d) => d.status === 'ONLINE').length / devices.length) * 100) : 0,
  };
}

// ---- app ------------------------------------------------------------------------------------------
function createApp({ jwtSecret }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000').split(','), credentials: false }));
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  const sign = (u) => jwt.sign({ sub: String(u.id), role: u.role, username: u.username }, jwtSecret, { expiresIn: '8h' });

  /** Requires a valid token; optionally one of `roles`. The role is read from the database, so changes apply at once. */
  const auth = (roles) => async (req, res, next) => {
    const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
    let payload;
    try { payload = m && jwt.verify(m[1], jwtSecret); } catch { /* falls through */ }
    if (!payload) throw new HttpError(401, 'Session expired, please sign in again');
    const [u] = await db.query('SELECT id, username, name, role FROM users WHERE id = ?', [Number(payload.sub)]);
    if (!u) throw new HttpError(401, 'Session expired, please sign in again');
    if (roles && !roles.includes(u.role)) throw new HttpError(403, 'Not allowed for your role');
    req.user = u;
    next();
  };

  // Brute-force guard for sign-in / register: AUTH_RATE_LIMIT (default 20) attempts per 15 minutes.
  const hits = new Map();
  const limited = (req, res, next) => {
    // Counted per address, route and username (behind the Next.js proxy every visitor shares one address).
    const limit = Number(process.env.AUTH_RATE_LIMIT) || 20;
    const key = `${req.ip}|${req.path}|${String(req.body?.username ?? '').toLowerCase()}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 15 * 60_000);
    if (recent.length >= limit) throw new HttpError(429, 'Too many attempts, try again in a few minutes');
    hits.set(key, [...recent, now]);
    next();
  };

  const r = express.Router();

  // ---- health -------------------------------------------------------------------
  r.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1');
      // "engine" and "version" tell you which backend is answering (an old one still running looks different).
      res.json({ status: 'ok', database: 'connected', engine: 'mysql', version: VERSION });
    } catch {
      res.status(503).json({ status: 'error', database: 'disconnected' });
    }
  });

  // ---- auth: register / login / me -------------------------------------------------
  r.post('/auth/register', limited, async (req, res) => {
    const b = req.body ?? {};
    const username = str(b.username, 'Username', { min: 3, max: 30, required: true }).toLowerCase();
    if (!/^[a-z0-9_.]+$/.test(username)) throw bad('Username can only use letters, numbers, dots and underscores');
    const name = str(b.name, 'Full name', { min: 2, max: 60, required: true });
    if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72) throw bad('Password must be 8–72 characters');
    if ((await db.query('SELECT id FROM users WHERE username = ?', [username])).length) throw new HttpError(409, 'That username is already taken');
    const hash = await bcrypt.hash(b.password, 12);
    const { insertId } = await db.run('INSERT INTO users (username, password_hash, name, role, created_at) VALUES (?,?,?,?,?)', [username, hash, name, 'VIEWER', L.sqlDate()]);
    const user = { id: insertId, username, name, role: 'VIEWER' };
    res.status(201).json({ token: sign(user), user: serUser(user) });
  });

  const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // keeps timing the same when the username does not exist
  r.post('/auth/login', limited, async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = req.body?.password;
    if (!username || typeof password !== 'string' || !password) throw bad('Username and password are required');
    const [u] = await db.query('SELECT id, username, password_hash, name, role FROM users WHERE username = ?', [username]);
    const ok = await bcrypt.compare(password, u?.password_hash ?? DUMMY_HASH);
    if (!u || !ok) throw new HttpError(401, 'Invalid username or password');
    res.json({ token: sign(u), user: serUser(u) });
  });

  r.get('/auth/me', auth(), (req, res) => res.json(serUser(req.user)));

  // ---- users (admin) --------------------------------------------------------------------
  const userId = (s) => {
    const n = L.parseId('U', s);
    if (n === null) throw notFound('User');
    return n;
  };
  r.get('/users', auth(['ADMIN']), async (req, res) => {
    const rows = await db.query('SELECT id, username, name, role, created_at FROM users ORDER BY id');
    res.json(rows.map((u) => ({ ...serUser(u), createdAt: L.iso(u.created_at) })));
  });
  r.post('/users', auth(['ADMIN']), async (req, res) => {
    const b = req.body ?? {};
    const username = str(b.username, 'Username', { min: 3, max: 30, required: true }).toLowerCase();
    if (!/^[a-z0-9_.]+$/.test(username)) throw bad('Username can only use letters, numbers, dots and underscores');
    const name = str(b.name, 'Full name', { min: 2, max: 60, required: true });
    const role = oneOf(b.role, 'Role', ROLES, { required: true });
    if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72) throw bad('Password must be 8–72 characters');
    if ((await db.query('SELECT id FROM users WHERE username = ?', [username])).length) throw new HttpError(409, 'That username is already taken');
    const { insertId } = await db.run('INSERT INTO users (username, password_hash, name, role, created_at) VALUES (?,?,?,?,?)', [username, await bcrypt.hash(b.password, 12), name, role, L.sqlDate()]);
    res.status(201).json(serUser({ id: insertId, username, name, role }));
  });
  r.patch('/users/:id', auth(['ADMIN']), async (req, res) => {
    const id = userId(req.params.id);
    const [u] = await db.query('SELECT id, role FROM users WHERE id = ?', [id]);
    if (!u) throw notFound('User');
    const b = req.body ?? {};
    const fields = defined({ name: str(b.name, 'Full name', { min: 2, max: 60 }), role: oneOf(b.role, 'Role', ROLES) });
    if (b.password !== undefined) {
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72) throw bad('Password must be 8–72 characters');
      fields.password_hash = await bcrypt.hash(b.password, 12);
    }
    if (fields.role && fields.role !== 'ADMIN' && u.role === 'ADMIN') {
      const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN'");
      if (Number(n) <= 1) throw new HttpError(409, 'There must be at least one administrator');
    }
    await update('users', fields, 'id = ?', [id]);
    const [row] = await db.query('SELECT id, username, name, role, created_at FROM users WHERE id = ?', [id]);
    res.json({ ...serUser(row), createdAt: L.iso(row.created_at) });
  });
  r.delete('/users/:id', auth(['ADMIN']), async (req, res) => {
    const id = userId(req.params.id);
    if (id === req.user.id) throw new HttpError(409, 'You cannot delete your own account');
    const [u] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
    if (!u) throw notFound('User');
    if (u.role === 'ADMIN') {
      const [{ n }] = await db.query("SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN'");
      if (Number(n) <= 1) throw new HttpError(409, 'There must be at least one administrator');
    }
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  });

  // ---- dashboard -----------------------------------------------------------------------------
  r.get('/dashboard/summary', auth(), async (req, res) => res.json(await kpi()));

  // ---- intersections (CRUD) ---------------------------------------------------------------------
  const intFields = (b, create) => defined({
    name: str(b.name, 'Name', { min: 2, max: 100, required: create }),
    barangay: str(b.barangay, 'Barangay', { max: 60 }),
    lat: num(b.lat, 'Latitude', { min: -90, max: 90 }),
    lng: num(b.lng, 'Longitude', { min: -180, max: 180 }),
    mode: oneOf(b.mode, 'Signal mode', MODES),
    speed_limit_kph: num(b.speedLimitKph, 'Speed limit', { min: 10, max: 120, int: true }),
  });
  r.get('/intersections', auth(), async (req, res) => {
    const rows = await intersectionRows();
    const dev = await devicesOf(rows.map((i) => i.id));
    res.json(rows.map((i) => serInt(i, dev.get(i.id))));
  });
  r.post('/intersections', auth(['ADMIN']), async (req, res) => {
    const f = intFields(req.body ?? {}, true);
    const id = await nextId('intersections', 'INT');
    await db.run(
      'INSERT INTO intersections (id, name, barangay, lat, lng, mode, speed_limit_kph, traffic_scale, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [id, f.name, f.barangay ?? '', f.lat ?? 0, f.lng ?? 0, f.mode ?? 'ADAPTIVE', f.speed_limit_kph ?? 40, L.round1(0.7 + L.noise(id) * 0.9), L.sqlDate()],
    );
    res.status(201).json(await intersectionJson(await intersectionById(id)));
  });
  r.get('/intersections/:id', auth(), async (req, res) => res.json(await intersectionJson(await intersectionById(req.params.id))));
  const patchIntersection = async (req, res) => {
    await intersectionById(req.params.id);
    await update('intersections', intFields(req.body ?? {}, false), 'id = ?', [req.params.id]);
    res.json(await intersectionJson(await intersectionById(req.params.id)));
  };
  r.patch('/intersections/:id', auth(['ADMIN']), patchIntersection);
  r.put('/intersections/:id', auth(['ADMIN']), patchIntersection);
  r.delete('/intersections/:id', auth(['ADMIN']), async (req, res) => {
    await intersectionById(req.params.id);
    await db.run('DELETE FROM intersections WHERE id = ?', [req.params.id]); // cameras, sensors, counts and violations go with it
    res.json({ ok: true });
  });
  // No hardware is attached yet, so the signal follows a software timing cycle and lane sensors report "idle".
  r.get('/intersections/:id/signal', auth(), async (req, res) => {
    const i = await intersectionById(req.params.id);
    res.json({ intersectionId: i.id, phases: L.phasesOf(L.signalCtl(i.id)), mode: i.mode, updatedAt: nowIso() });
  });
  r.get('/intersections/:id/lanes', auth(), async (req, res) => {
    const i = await intersectionById(req.params.id);
    const sens = await db.query('SELECT * FROM sensors WHERE intersection_id = ? ORDER BY approach, lane', [i.id]);
    res.json(sens.map((s) => ({
      intersectionId: i.id, approach: s.approach, lane: s.lane, queueLength: 0, density: 'LOW', cameraCounts: {},
      sensor: { sensorId: s.id, timestamp: nowIso(), vehiclePresent: false, distanceM: null, distanceLevel: 'NONE', countLast5Min: 0 },
    })));
  });

  // ---- cameras (CRUD) ------------------------------------------------------------------------------
  const camFields = (b, create) => defined({
    approach: oneOf(b.approach, 'Approach', APPROACHES, { required: create }),
    name: str(b.name, 'Name', { min: 2, max: 100 }),
    stream_url: (() => {
      const u = str(b.streamUrl, 'Stream URL', { max: 500 });
      if (u && !/^(https?|rtsp):\/\//i.test(u)) throw bad('Stream URL must start with http://, https:// or rtsp://');
      return u;
    })(),
    stream_type: oneOf(b.streamType, 'Stream type', STREAM_TYPES),
    resolution: (() => {
      const s = str(b.resolution, 'Resolution', { max: 12 });
      if (s && !/^\d{3,5}x\d{3,5}$/.test(s)) throw bad('Resolution looks like 1920x1080');
      return s;
    })(),
    fps: num(b.fps, 'FPS', { min: 1, max: 120, int: true }),
    status: oneOf(b.status, 'Status', DEVICE_STATUSES),
  });
  r.get('/cameras', auth(), async (req, res) => {
    const id = req.query.intersectionId;
    const rows = id ? await db.query('SELECT * FROM cameras WHERE intersection_id = ? ORDER BY id', [String(id)]) : await db.query('SELECT * FROM cameras ORDER BY id');
    res.json(rows.map((c) => serCam(c, req.user.role)));
  });
  r.post('/cameras', auth(['ADMIN']), async (req, res) => {
    const b = req.body ?? {};
    const inter = await intersectionById(str(b.intersectionId, 'Intersection', { required: true, max: 12 }));
    const f = camFields(b, true);
    const used = (await db.query('SELECT channel FROM cameras WHERE intersection_id = ?', [inter.id])).map((c) => c.channel);
    const channel = num(b.channel, 'Channel', { min: 1, max: 64, int: true }) ?? Math.max(0, ...used) + 1;
    if (used.includes(channel)) throw new HttpError(409, `Channel ${channel} already exists on this intersection`);
    const id = `CAM-${inter.id.slice(4)}-${channel}`;
    await db.run(
      'INSERT INTO cameras (id, intersection_id, channel, approach, name, stream_url, stream_type, resolution, status, fps, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [id, inter.id, channel, f.approach, f.name ?? `${inter.name} Ch ${channel}`, f.stream_url ?? '', f.stream_type ?? 'HLS', f.resolution ?? '1920x1080', f.status ?? 'ONLINE', f.fps ?? 25, L.sqlDate()],
    );
    const [row] = await db.query('SELECT * FROM cameras WHERE id = ?', [id]);
    res.status(201).json(serCam(row));
  });
  r.get('/cameras/:id', auth(), async (req, res) => {
    const [row] = await db.query('SELECT * FROM cameras WHERE id = ?', [req.params.id]);
    if (!row) throw notFound('Camera');
    res.json(serCam(row, req.user.role));
  });
  r.patch('/cameras/:id', auth(['ADMIN']), async (req, res) => {
    const [row] = await db.query('SELECT * FROM cameras WHERE id = ?', [req.params.id]);
    if (!row) throw notFound('Camera');
    const f = camFields(req.body ?? {}, false);
    if (f.status) f.last_seen = L.sqlDate();
    await update('cameras', f, 'id = ?', [row.id]);
    if (f.status === 'OFFLINE' && row.status !== 'OFFLINE')
      await db.run('INSERT INTO alerts (type, severity, intersection_id, message, ts, acknowledged, ref_id) VALUES (?,?,?,?,?,0,?)',
        ['CAMERA_OFFLINE', 'CRITICAL', row.intersection_id, `${f.name ?? row.name} went offline`, L.sqlDate(), row.id]);
    const [next] = await db.query('SELECT * FROM cameras WHERE id = ?', [row.id]);
    res.json(serCam(next));
  });
  r.delete('/cameras/:id', auth(['ADMIN']), async (req, res) => {
    const { affectedRows } = await db.run('DELETE FROM cameras WHERE id = ?', [req.params.id]);
    if (!affectedRows) throw notFound('Camera');
    res.json({ ok: true });
  });

  // ---- sensors (CRUD, registry only) -----------------------------------------------------------------
  const senFields = (b, create) => {
    const t = b.thresholds ?? {};
    return defined({
      approach: oneOf(b.approach, 'Approach', APPROACHES, { required: create }),
      lane: num(b.lane, 'Lane', { min: 1, max: 8, int: true }),
      max_range_m: num(b.maxRangeM, 'Max range', { min: 0.5, max: 10 }),
      near_m: num(t.nearM, 'Near threshold', { min: 0.1, max: 10 }),
      mid_m: num(t.midM, 'Mid threshold', { min: 0.1, max: 10 }),
      far_m: num(t.farM, 'Far threshold', { min: 0.1, max: 10 }),
      status: oneOf(b.status, 'Status', DEVICE_STATUSES),
    });
  };
  r.get('/sensors', auth(), async (req, res) => {
    const id = req.query.intersectionId;
    const rows = id ? await db.query('SELECT * FROM sensors WHERE intersection_id = ? ORDER BY id', [String(id)]) : await db.query('SELECT * FROM sensors ORDER BY id');
    res.json(rows.map(serSensor));
  });
  r.post('/sensors', auth(['ADMIN']), async (req, res) => {
    const b = req.body ?? {};
    const inter = await intersectionById(str(b.intersectionId, 'Intersection', { required: true, max: 12 }));
    const f = senFields(b, true);
    const lane = f.lane ?? 1;
    const id = `US-${inter.id.slice(4)}-${f.approach}${lane}`;
    if ((await db.query('SELECT id FROM sensors WHERE id = ?', [id])).length) throw new HttpError(409, 'That sensor already exists');
    await db.run(
      'INSERT INTO sensors (id, intersection_id, approach, lane, max_range_m, near_m, mid_m, far_m, status, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, inter.id, f.approach, lane, f.max_range_m ?? 4.5, f.near_m ?? 1.5, f.mid_m ?? 3, f.far_m ?? 4.5, f.status ?? 'ONLINE', L.sqlDate()],
    );
    const [row] = await db.query('SELECT * FROM sensors WHERE id = ?', [id]);
    res.status(201).json(serSensor(row));
  });
  r.patch('/sensors/:id', auth(['ADMIN']), async (req, res) => {
    const [row] = await db.query('SELECT * FROM sensors WHERE id = ?', [req.params.id]);
    if (!row) throw notFound('Sensor');
    const f = senFields(req.body ?? {}, false);
    if (f.status) f.last_seen = L.sqlDate();
    await update('sensors', f, 'id = ?', [row.id]);
    const [next] = await db.query('SELECT * FROM sensors WHERE id = ?', [row.id]);
    res.json(serSensor(next));
  });
  r.delete('/sensors/:id', auth(['ADMIN']), async (req, res) => {
    const { affectedRows } = await db.run('DELETE FROM sensors WHERE id = ?', [req.params.id]);
    if (!affectedRows) throw notFound('Sensor');
    res.json({ ok: true });
  });

  // ---- traffic + reports (read) ------------------------------------------------------------------------
  r.get('/traffic/hourly', auth(), async (req, res) => {
    const scope = String(req.query.intersectionId || 'ALL');
    const date = req.query.date ? String(req.query.date) : L.manilaToday();
    if (!L.isDate(date)) throw bad('date must look like 2026-10-26');
    res.json(await hourlyFor(scope, date));
  });
  r.get('/reports/daily', auth(), async (req, res) => {
    const date = req.query.date ? String(req.query.date) : L.manilaToday();
    if (!L.isDate(date)) throw bad('date must look like 2026-10-26');
    res.json(await dailyReport(date, String(req.query.intersectionId || 'ALL')));
  });
  r.get('/reports/weekly', auth(), async (req, res) => {
    const start = req.query.start ? String(req.query.start) : L.manilaToday();
    if (!L.isDate(start)) throw bad('start must look like 2026-10-26');
    const scope = String(req.query.intersectionId || 'ALL');
    const ints = await intersectionRows();
    if (scope !== 'ALL' && !ints.some((i) => i.id === scope)) throw notFound('Intersection');
    const days = await Promise.all(Array.from({ length: 7 }, async (_, i) => {
      const date = L.addDays(start, i);
      return { date, hourly: (await hourlyFor(scope, date, ints)).map((h) => h.total) };
    }));
    res.json({ start, intersectionId: scope, days });
  });

  // ---- violations (CRUD) ----------------------------------------------------------------------------------
  const vioId = (s) => {
    const n = L.parseId('VIO', s);
    if (n === null) throw notFound('Violation');
    return n;
  };
  const VIO_SELECT = 'SELECT v.*, i.name AS intersection_name FROM violations v JOIN intersections i ON i.id = v.intersection_id';
  const vioFull = async (id, user) => {
    const [row] = await db.query(`${VIO_SELECT} WHERE v.id = ?`, [id]);
    if (!row) throw notFound('Violation');
    const audit = await db.query('SELECT happened_at, by_name, action FROM violation_audit WHERE violation_id = ? ORDER BY happened_at, id', [id]);
    return redact(serViolation(row, { audit, full: true }), user);
  };

  r.get('/violations', auth(), async (req, res) => {
    const q = req.query;
    const where = [];
    const params = [];
    if (q.from) { if (!L.isDate(String(q.from))) throw bad('from must look like 2026-10-26'); where.push('v.ts >= ?'); params.push(L.sqlDate(L.manilaDayStart(String(q.from)))); }
    if (q.to) { if (!L.isDate(String(q.to))) throw bad('to must look like 2026-10-26'); where.push('v.ts < ?'); params.push(L.sqlDate(L.manilaDayStart(L.addDays(String(q.to), 1)))); }
    for (const [key, col] of [['intersectionId', 'v.intersection_id'], ['type', 'v.vehicle_type'], ['status', 'v.status']])
      if (q[key]) { where.push(`${col} = ?`); params.push(String(q[key])); }
    if (q.minSpeed) { where.push('v.speed_kph >= ?'); params.push(Number(q.minSpeed) || 0); }
    if (q.maxSpeed) { where.push('v.speed_kph <= ?'); params.push(Number(q.maxSpeed) || 0); }
    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const page = Math.max(1, Math.floor(Number(q.page)) || 1);
    const size = Math.min(1000, Math.max(1, Math.floor(Number(q.size)) || 20));
    const [{ n }] = await db.query(`SELECT COUNT(*) AS n FROM violations v${w}`, params);
    const rows = await db.query(
      `SELECT v.id, v.ts, v.intersection_id, v.camera_id, v.approach, v.lane, v.vehicle_type, v.speed_kph, v.limit_kph, v.plate_number, v.confidence, v.image_url, v.status, v.notes, i.name AS intersection_name
       FROM violations v JOIN intersections i ON i.id = v.intersection_id${w} ORDER BY v.ts DESC, v.id DESC LIMIT ? OFFSET ?`,
      [...params, size, (page - 1) * size],
    );
    res.json({ data: rows.map((v) => redact(serViolation(v), req.user)), page, size, total: Number(n) });
  });

  r.get('/violations/:id', auth(OPS), async (req, res) => {
    const id = vioId(req.params.id);
    await vioFull(id, req.user); // 404 if missing
    await db.run('INSERT INTO violation_audit (violation_id, happened_at, by_name, action) VALUES (?,?,?,?)', [id, L.sqlDate(), req.user.name, 'Viewed evidence']);
    res.json(await vioFull(id, req.user));
  });

  r.post('/violations', auth(OPS), async (req, res) => {
    const b = req.body ?? {};
    const inter = await intersectionById(str(b.intersectionId, 'Intersection', { required: true, max: 12 }));
    const approach = oneOf(b.approach, 'Approach', APPROACHES, { required: true });
    const lane = num(b.lane, 'Lane', { min: 1, max: 8, int: true }) ?? 1;
    const type = oneOf(b.vehicleType, 'Vehicle type', L.VEHICLE_TYPES, { required: true });
    const speed = num(b.speedKph, 'Speed', { min: 1, max: 300, required: true });
    if (speed <= inter.speed_limit_kph) throw bad(`Speed must be above the ${inter.speed_limit_kph} km/h limit`);
    let plate = str(b.plateNumber, 'Plate number', { max: 12 });
    plate = plate ? plate.toUpperCase() : null;
    if (plate && !PLATE.test(plate)) throw bad('Plate number: 2–12 letters, digits, spaces or dashes');
    const notes = str(b.notes, 'Notes', { max: 2000 }) ?? null;
    let cameraId = str(b.cameraId, 'Camera', { max: 20 }) || null;
    if (cameraId && !(await db.query('SELECT id FROM cameras WHERE id = ? AND intersection_id = ?', [cameraId, inter.id])).length) throw bad('That camera does not belong to this intersection');
    let when = new Date();
    if (b.timestamp !== undefined) {
      when = new Date(b.timestamp);
      if (Number.isNaN(+when) || +when > Date.now() + 60_000) throw bad('Time must be a valid date that is not in the future');
    }
    const stamp = when.toISOString();
    const frames = [0, 1, 2].map((k) => L.snapshot(type, speed, cameraId, stamp, k));
    const { insertId } = await db.run(
      `INSERT INTO violations (ts, intersection_id, camera_id, approach, lane, vehicle_type, speed_kph, limit_kph, plate_number, confidence, image_url, extra_frames, status, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [L.sqlDate(when), inter.id, cameraId, approach, lane, type, speed, inter.speed_limit_kph, plate, 1, frames[0], JSON.stringify(frames.slice(1)), 'NEW', notes],
    );
    await db.run('INSERT INTO violation_audit (violation_id, happened_at, by_name, action) VALUES (?,?,?,?)', [insertId, L.sqlDate(), req.user.name, 'Recorded manually']);
    res.status(201).json(await vioFull(insertId, req.user));
  });

  r.patch('/violations/:id', auth(OPS), async (req, res) => {
    const id = vioId(req.params.id);
    const [v] = await db.query('SELECT status, plate_number, notes FROM violations WHERE id = ?', [id]);
    if (!v) throw notFound('Violation');
    const body = req.body ?? {};
    // Validate everything before changing anything.
    if (body.status !== undefined && !VIOLATION_STATUSES.includes(body.status)) throw bad('Invalid status');
    if (body.status === 'ISSUED' && v.status !== 'VERIFIED') throw new HttpError(409, 'Only verified violations can be issued');
    const plate = body.plateNumber === undefined ? undefined : String(body.plateNumber ?? '').trim().toUpperCase() || null;
    if (plate && !PLATE.test(plate)) throw bad('Plate number: 2–12 letters, digits, spaces or dashes');
    if (body.notes !== undefined && typeof body.notes !== 'string') throw bad('Invalid notes');

    const at = L.sqlDate();
    const audit = [];
    const fields = {};
    if (body.status !== undefined && body.status !== v.status) {
      audit.push(`Status ${v.status} → ${body.status}`);
      fields.status = body.status;
    }
    if (plate !== undefined && plate !== v.plate_number) {
      audit.push(`Plate ${v.plate_number ?? '—'} → ${plate ?? '—'}`);
      fields.plate_number = plate;
    }
    if (typeof body.notes === 'string' && body.notes !== (v.notes ?? '')) {
      audit.push('Updated notes');
      fields.notes = body.notes.slice(0, 2000);
    }
    if (Object.keys(fields).length) await update('violations', fields, 'id = ?', [id]);
    for (const action of audit) await db.run('INSERT INTO violation_audit (violation_id, happened_at, by_name, action) VALUES (?,?,?,?)', [id, at, req.user.name, action]);
    res.json(await vioFull(id, req.user));
  });

  r.delete('/violations/:id', auth(['ADMIN']), async (req, res) => {
    const { affectedRows } = await db.run('DELETE FROM violations WHERE id = ?', [vioId(req.params.id)]);
    if (!affectedRows) throw notFound('Violation');
    res.json({ ok: true });
  });

  // ---- alerts (CRUD) ------------------------------------------------------------------------------------------
  const alertId = (s) => {
    const n = L.parseId('ALR', s);
    if (n === null) throw notFound('Alert');
    return n;
  };
  const alertRow = async (id) => {
    const [row] = await db.query('SELECT * FROM alerts WHERE id = ?', [id]);
    if (!row) throw notFound('Alert');
    return row;
  };
  r.get('/alerts', auth(), async (req, res) => {
    const q = req.query;
    const where = [];
    const params = [];
    if (q.ack) { where.push('acknowledged = ?'); params.push(q.ack === 'true' ? 1 : 0); }
    for (const [key, col] of [['type', 'type'], ['severity', 'severity'], ['intersectionId', 'intersection_id']])
      if (q[key]) { where.push(`${col} = ?`); params.push(String(q[key])); }
    const rows = await db.query(`SELECT * FROM alerts${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY ts DESC, id DESC LIMIT 500`, params);
    res.json(rows.map(serAlert));
  });
  r.post('/alerts', auth(OPS), async (req, res) => {
    const b = req.body ?? {};
    const type = oneOf(b.type, 'Type', ALERT_TYPES, { required: true });
    const severity = oneOf(b.severity, 'Severity', SEVERITIES, { required: true });
    const message = str(b.message, 'Message', { min: 3, max: 300, required: true });
    const intersectionId = str(b.intersectionId, 'Intersection', { max: 12 }) || null;
    if (intersectionId) await intersectionById(intersectionId);
    const { insertId } = await db.run('INSERT INTO alerts (type, severity, intersection_id, message, ts, acknowledged, ref_id) VALUES (?,?,?,?,?,0,NULL)',
      [type, severity, intersectionId, message, L.sqlDate()]);
    res.status(201).json(serAlert(await alertRow(insertId)));
  });
  r.patch('/alerts/:id', auth(OPS), async (req, res) => {
    const id = alertId(req.params.id);
    await alertRow(id);
    const b = req.body ?? {};
    const fields = defined({
      type: oneOf(b.type, 'Type', ALERT_TYPES),
      severity: oneOf(b.severity, 'Severity', SEVERITIES),
      message: str(b.message, 'Message', { min: 3, max: 300 }),
      acknowledged: typeof b.acknowledged === 'boolean' ? (b.acknowledged ? 1 : 0) : undefined,
    });
    await update('alerts', fields, 'id = ?', [id]);
    res.json(serAlert(await alertRow(id)));
  });
  r.post('/alerts/:id/ack', auth(OPS), async (req, res) => {
    const id = alertId(req.params.id);
    await alertRow(id);
    await db.run('UPDATE alerts SET acknowledged = 1 WHERE id = ?', [id]);
    res.json(serAlert(await alertRow(id)));
  });
  r.delete('/alerts/:id', auth(OPS), async (req, res) => {
    const { affectedRows } = await db.run('DELETE FROM alerts WHERE id = ?', [alertId(req.params.id)]);
    if (!affectedRows) throw notFound('Alert');
    res.json({ ok: true });
  });

  app.use('/api/v1', r);
  app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request too large' });
    if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ETIMEDOUT'].includes(err.code)) return res.status(503).json({ message: 'Database unavailable' });
    console.error(err);
    res.status(500).json({ message: 'Something went wrong on the server' });
  });
  return app;
}

// ---- start up ------------------------------------------------------------------------------------------------
async function bootstrapAdmin() {
  const [{ n }] = await db.query('SELECT COUNT(*) AS n FROM users');
  if (Number(n) > 0) return;
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    throw new Error('Set BOOTSTRAP_ADMIN_USERNAME and a password of at least 12 characters in backend/.env');
  }
  await db.run('INSERT INTO users (username, password_hash, name, role, created_at) VALUES (?,?,?,?,?)',
    [username, await bcrypt.hash(password, 12), 'System Administrator', 'ADMIN', L.sqlDate()]);
  console.log(`Initial administrator account "${username}" created.`);
}

function explain(e) {
  const c = db.config();
  if (e.code === 'ECONNREFUSED') return `Cannot reach MySQL at ${c.host}:${c.port}. Start the MySQL server (Workbench -> Server Status, or the MySQL service in Windows), then run again.`;
  if (e.code === 'EADDRINUSE') return `Port ${PORT} is already in use, so an older backend is probably still running and answering instead of this one.\nClose it (Ctrl+C in its terminal), or on Windows run:  netstat -ano | findstr :${PORT}   then   taskkill /PID <the number at the end> /F\nThen run  npm run backend  again.`;
  if (e.code === 'ER_ACCESS_DENIED_ERROR') return `MySQL refused the login for user "${c.user}". Put the right DB_USER / DB_PASSWORD in backend/.env.`;
  return e.stack || String(e);
}

async function start({ initOnly = false } = {}) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) throw new Error('Set a strong JWT_SECRET (32+ characters) in backend/.env');
  await db.init();
  await bootstrapAdmin();
  if (process.env.SEED_SAMPLE_DATA !== 'false' && (await seedSampleData())) console.log('Sample intersections, cameras, violations and alerts loaded.');
  if (initOnly) {
    console.log(`Database "${db.config().database}" is ready.`);
    return db.close();
  }
  const app = createApp({ jwtSecret });
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '127.0.0.1', () => {
      console.log(`Smart Traffic API running at http://127.0.0.1:${PORT}  (MySQL database "${db.config().database}" on ${db.config().host})`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  start({ initOnly: process.argv.includes('--init-only') }).catch((e) => {
    console.error(`\nCould not start the backend:\n${explain(e)}\n`);
    process.exit(1);
  });
}

module.exports = { createApp, start };

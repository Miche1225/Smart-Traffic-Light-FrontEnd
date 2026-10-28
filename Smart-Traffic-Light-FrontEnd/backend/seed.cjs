// Sample data so the dashboard is not empty on the first run: 4 intersections with cameras and sensors,
// a week of over-speeding records and a few alerts. Runs once (it remembers in app_meta).
const db = require('./db.cjs');
const L = require('./lib.cjs');

const DEFS = [
  { id: 'INT-001', name: 'Main St – Rizal Ave', barangay: 'Poblacion', lat: 10.3157, lng: 123.8854, cams: 4, lanes: 2, scale: 1.3 },
  { id: 'INT-002', name: 'Mabini St – Bonifacio Ave', barangay: 'San Isidro', lat: 10.3201, lng: 123.8912, cams: 3, lanes: 1, scale: 0.9 },
  { id: 'INT-003', name: 'National Hwy – Market Rd', barangay: 'Santa Cruz', lat: 10.3089, lng: 123.8798, cams: 4, lanes: 2, scale: 1.6 },
  { id: 'INT-004', name: 'Plaza Junction', barangay: 'Poblacion', lat: 10.3172, lng: 123.8821, cams: 2, lanes: 1, scale: 0.7 },
];
const APPROACHES = ['N', 'S', 'E', 'W'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const STATUSES = ['NEW', 'UNDER_REVIEW', 'VERIFIED', 'DISMISSED', 'ISSUED'];

async function seedSampleData() {
  const done = await db.query("SELECT v FROM app_meta WHERE k = 'sample_data'");
  if (done.length) return false;

  const rng = L.mulberry32(20261022);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const now = Date.now();
  const at = (msAgo = 0) => L.sqlDate(new Date(now - msAgo));

  for (const d of DEFS) {
    await db.run(
      'INSERT INTO intersections (id, name, barangay, lat, lng, mode, speed_limit_kph, traffic_scale, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [d.id, d.name, d.barangay, d.lat, d.lng, 'ADAPTIVE', 40, d.scale, at()],
    );
  }

  const cams = DEFS.flatMap((d) => Array.from({ length: d.cams }, (_, i) => ({
    id: `CAM-${d.id.slice(4)}-${i + 1}`, intersectionId: d.id, channel: i + 1, approach: APPROACHES[i % 4], name: `${d.name} Ch ${i + 1}`,
  })));
  const sens = DEFS.flatMap((d) => APPROACHES.flatMap((a) => Array.from({ length: d.lanes }, (_, l) => ({
    id: `US-${d.id.slice(4)}-${a}${l + 1}`, intersectionId: d.id, approach: a, lane: l + 1,
  }))));
  const offlineCam = cams[6], offlineSensor = sens[5];

  for (const c of cams) {
    const off = c === offlineCam;
    await db.run(
      'INSERT INTO cameras (id, intersection_id, channel, approach, name, stream_url, stream_type, resolution, status, fps, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [c.id, c.intersectionId, c.channel, c.approach, c.name, '', 'HLS', '1920x1080', off ? 'OFFLINE' : 'ONLINE', 25, at(off ? 52 * 60_000 : 0)],
    );
  }
  for (const s of sens) {
    const off = s === offlineSensor;
    await db.run(
      'INSERT INTO sensors (id, intersection_id, approach, lane, max_range_m, near_m, mid_m, far_m, status, last_seen) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [s.id, s.intersectionId, s.approach, s.lane, 4.5, 1.5, 3, 4.5, off ? 'OFFLINE' : 'ONLINE', at(off ? 20 * 60_000 : 0)],
    );
  }

  // 30 over-speeding captures in the last 7 days.
  const vios = Array.from({ length: 30 }, () => new Date(now - rng() * 7 * 864e5).getTime()).sort((a, b) => b - a);
  const inserted = [];
  for (const when of vios) {
    const cam = pick(cams);
    const def = DEFS.find((d) => d.id === cam.intersectionId);
    const type = L.pickType(rng());
    const speed = 40 + 5 + Math.round(rng() * 35);
    const ts = new Date(when).toISOString();
    const plate = rng() < 0.7 ? `${pick([...LETTERS])}${pick([...LETTERS])}${pick([...LETTERS])} ${Math.floor(1000 + rng() * 9000)}` : null;
    const lane = 1 + Math.floor(rng() * def.lanes);
    const confidence = Math.round((0.6 + rng() * 0.39) * 100) / 100;
    const status = pick(STATUSES);
    const r = await db.run(
      `INSERT INTO violations (ts, intersection_id, camera_id, approach, lane, vehicle_type, speed_kph, limit_kph, plate_number, confidence, image_url, extra_frames, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [L.sqlDate(when), def.id, cam.id, cam.approach, lane, type, speed, 40, plate, confidence,
        L.snapshot(type, speed, cam.id, ts, 0), JSON.stringify([L.snapshot(type, speed, cam.id, ts, 1), L.snapshot(type, speed, cam.id, ts, 2)]), status],
    );
    await db.run('INSERT INTO violation_audit (violation_id, happened_at, by_name, action) VALUES (?,?,?,?)', [r.insertId, L.sqlDate(when), 'System', 'Captured by speed detection']);
    inserted.push({ id: r.insertId, when, type, speed, def });
  }

  const alert = (type, severity, message, intersectionId, refId, ts, ack) =>
    db.run('INSERT INTO alerts (type, severity, intersection_id, message, ts, acknowledged, ref_id) VALUES (?,?,?,?,?,?,?)',
      [type, severity, intersectionId, message, ts, ack ? 1 : 0, refId]);
  for (const v of inserted.slice(0, 6))
    await alert('OVERSPEED', 'WARNING', `${v.type} at ${v.speed} km/h (limit 40) — ${v.def.name}`, v.def.id, L.fmtId('VIO', v.id), L.sqlDate(v.when), true);
  await alert('CAMERA_OFFLINE', 'CRITICAL', `${offlineCam.name} went offline`, offlineCam.intersectionId, offlineCam.id, at(52 * 60_000), false);
  await alert('SENSOR_FAULT', 'WARNING', `Ultrasonic sensor ${offlineSensor.id} not responding`, offlineSensor.intersectionId, offlineSensor.id, at(20 * 60_000), false);
  await alert('HEAVY_CONGESTION', 'WARNING', `Heavy congestion at ${DEFS[2].name}`, DEFS[2].id, null, at(3 * 3600_000), true);
  await alert('SIGNAL_FAULT', 'CRITICAL', `Signal controller timeout at ${DEFS[1].name} (recovered)`, DEFS[1].id, null, at(9 * 3600_000), true);

  await db.run("INSERT INTO app_meta (k, v) VALUES ('sample_data', ?)", [new Date().toISOString()]);
  return true;
}

module.exports = { seedSampleData };

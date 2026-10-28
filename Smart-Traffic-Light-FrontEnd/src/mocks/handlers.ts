import { http, HttpResponse } from 'msw';
import type { Role, User, Violation } from '../types';
import { manilaDateOf, manilaToday } from '../utils/format';
import * as db from './db';

const B = '/api/v1';
const OPS: Role[] = ['ADMIN', 'OPERATOR'];
const fail = (message: string, status: number) => HttpResponse.json({ message }, { status });
const sp = (r: Request) => new URL(r.url).searchParams;

type Ctx = { request: Request; params: Record<string, string | readonly string[] | undefined> };
/** Bearer-token check (and optional role check) like the real API. */
const guard = (fn: (c: Ctx & { user: User; id: string }) => Response | Promise<Response>, roles?: Role[]) => (c: Ctx) => {
  const u = db.users.find((x) => c.request.headers.get('Authorization') === `Bearer mock-${x.username}`);
  if (!u) return fail('Session expired, please sign in again', 401);
  if (roles && !roles.includes(u.role)) return fail('Not allowed for your role', 403);
  const { password: _pw, ...user } = u;
  return fn({ ...c, user, id: String(c.params.id ?? '') });
};

// Evidence (image, plate) is personal data under RA 10173: viewers never receive it.
const redact = (v: Violation, user: User): Violation =>
  user.role === 'VIEWER' ? { ...v, imageUrl: '', extraFrames: [], plateNumber: null, audit: [] } : v;

const withIntersection = (id: string, fn: () => Response) => (db.findIntersection(id) ? fn() : fail('Intersection not found', 404));

export const handlers = [
  http.post(`${B}/auth/login`, async ({ request }) => {
    const { username, password } = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
    const u = db.users.find((x) => x.username === username?.trim().toLowerCase() && x.password === password);
    if (!u) return fail('Invalid username or password', 401);
    const { password: _pw, ...user } = u;
    return HttpResponse.json({ token: `mock-${u.username}`, user });
  }),

  http.get(`${B}/dashboard/summary`, guard(() => HttpResponse.json(db.kpi()))),
  http.get(`${B}/intersections`, guard(() => HttpResponse.json(db.intersections))),
  http.get(`${B}/intersections/:id`, guard(({ id }) => withIntersection(id, () => HttpResponse.json(db.findIntersection(id))))),
  http.get(`${B}/intersections/:id/signal`, guard(({ id }) => withIntersection(id, () => HttpResponse.json(db.signalOf(id))))),
  http.get(`${B}/intersections/:id/lanes`, guard(({ id }) => withIntersection(id, () => HttpResponse.json(db.lanes(id))))),

  http.get(`${B}/cameras`, guard(({ request }) => {
    const id = sp(request).get('intersectionId');
    const now = new Date().toISOString();
    return HttpResponse.json(db.cameras.filter((c) => !id || c.intersectionId === id).map((c) => (c.status === 'OFFLINE' ? c : { ...c, lastSeen: now })));
  })),
  http.get(`${B}/sensors`, guard(({ request }) => {
    const id = sp(request).get('intersectionId');
    return HttpResponse.json(db.sensors.filter((s) => !id || s.intersectionId === id));
  })),
  http.get(`${B}/traffic/hourly`, guard(({ request }) => {
    const p = sp(request);
    const id = p.get('intersectionId') || 'ALL';
    if (id !== 'ALL' && !db.findIntersection(id)) return fail('Intersection not found', 404);
    return HttpResponse.json(db.hourlyFor(id, p.get('date') || manilaToday()));
  })),

  http.get(`${B}/violations`, guard(({ request, user }) => {
    const p = sp(request);
    const [from, to, int, type, status, min, max] = ['from', 'to', 'intersectionId', 'type', 'status', 'minSpeed', 'maxSpeed'].map((k) => p.get(k));
    const rows = db.violations.filter((v) => {
      const day = manilaDateOf(v.timestamp);
      return (!from || day >= from) && (!to || day <= to) && (!int || v.intersectionId === int) && (!type || v.vehicleType === type) &&
        (!status || v.status === status) && (!min || v.speedKph >= Number(min)) && (!max || v.speedKph <= Number(max));
    });
    const page = Math.max(1, Number(p.get('page')) || 1);
    const size = Math.min(1000, Math.max(1, Number(p.get('size')) || 20));
    return HttpResponse.json({ data: rows.slice((page - 1) * size, page * size).map((v) => redact(v, user)), page, size, total: rows.length });
  })),
  http.get(`${B}/violations/:id`, guard(({ id, user }) => {
    const v = db.violations.find((x) => x.id === id);
    if (!v) return fail('Violation not found', 404);
    v.audit.push({ at: new Date().toISOString(), by: user.name, action: 'Viewed evidence' });
    return HttpResponse.json(v);
  }, OPS)),
  http.patch(`${B}/violations/:id`, guard(async ({ id, request, user }) => {
    const v = db.violations.find((x) => x.id === id);
    if (!v) return fail('Violation not found', 404);
    const body = (await request.json().catch(() => ({}))) as { status?: unknown; plateNumber?: unknown; notes?: unknown };
    // Validate everything before changing anything.
    if (body.status !== undefined && !db.isStatus(body.status)) return fail('Invalid status', 400);
    if (body.status === 'ISSUED' && v.status !== 'VERIFIED') return fail('Only verified violations can be issued', 409);
    const plate = body.plateNumber === undefined ? undefined : String(body.plateNumber ?? '').trim().toUpperCase() || null;
    if (plate && !/^[A-Z0-9 -]{2,12}$/.test(plate)) return fail('Plate number: 2–12 letters, digits, spaces or dashes', 400);
    if (body.notes !== undefined && typeof body.notes !== 'string') return fail('Invalid notes', 400);

    const at = new Date().toISOString();
    if (db.isStatus(body.status) && body.status !== v.status) {
      v.audit.push({ at, by: user.name, action: `Status ${v.status} → ${body.status}` });
      v.status = body.status;
    }
    if (plate !== undefined && plate !== v.plateNumber) {
      v.audit.push({ at, by: user.name, action: `Plate ${v.plateNumber ?? '—'} → ${plate ?? '—'}` });
      v.plateNumber = plate;
    }
    if (typeof body.notes === 'string' && body.notes !== (v.notes ?? '')) {
      v.audit.push({ at, by: user.name, action: 'Updated notes' });
      v.notes = body.notes.slice(0, 2000);
    }
    return HttpResponse.json(v);
  }, OPS)),

  http.get(`${B}/alerts`, guard(({ request }) => {
    const p = sp(request);
    const [ack, type, severity, int] = ['ack', 'type', 'severity', 'intersectionId'].map((k) => p.get(k));
    return HttpResponse.json(db.alerts.filter((a) =>
      (!ack || String(a.acknowledged) === ack) && (!type || a.type === type) && (!severity || a.severity === severity) && (!int || a.intersectionId === int)));
  })),
  http.post(`${B}/alerts/:id/ack`, guard(({ id }) => {
    const a = db.alerts.find((x) => x.id === id);
    if (!a) return fail('Alert not found', 404);
    a.acknowledged = true;
    return HttpResponse.json(a);
  }, OPS)),

  http.get(`${B}/reports/daily`, guard(({ request }) => {
    const p = sp(request);
    const scope = p.get('intersectionId') || 'ALL';
    if (scope !== 'ALL' && !db.findIntersection(scope)) return fail('Intersection not found', 404);
    return HttpResponse.json(db.dailyReport(p.get('date') || manilaToday(), scope));
  })),
  http.get(`${B}/reports/weekly`, guard(({ request }) => {
    const p = sp(request);
    const scope = p.get('intersectionId') || 'ALL';
    if (scope !== 'ALL' && !db.findIntersection(scope)) return fail('Intersection not found', 404);
    return HttpResponse.json(db.weeklyReport(p.get('start') || manilaToday(), scope));
  })),
];

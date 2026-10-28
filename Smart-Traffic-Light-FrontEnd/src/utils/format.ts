import type { Approach, SignalColor, VehicleType } from '../types';

export const TZ = 'Asia/Manila';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o });
const dateF = fmt({ month: 'short', day: '2-digit', year: 'numeric' });
const timeF = fmt({ hour: 'numeric', minute: '2-digit' });
const timeSecF = fmt({ hour: 'numeric', minute: '2-digit', second: '2-digit' });

type When = string | number | Date;
export const fmtDate = (d: When) => dateF.format(new Date(d));
export const fmtTime = (d: When) => timeF.format(new Date(d));
export const fmtTimeSec = (d: When) => timeSecF.format(new Date(d));
export const fmtDateTime = (d: When) => `${fmtDate(d)} ${fmtTime(d)}`;

/** YYYY-MM-DD of the given instant in Manila. */
export const manilaToday = (d: When = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
export const manilaDateOf = manilaToday;
export const manilaHour = (d: When = new Date()) =>
  Number(new Date(d).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }));
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Format a YYYY-MM-DD calendar date without shifting it through a timezone. */
export const fmtDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' });

export const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`;
export const shortHour = (h: number) => `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`;
export const hourRange = (h: number) => `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`;

export const VEHICLE_TYPES: VehicleType[] = ['motorcycle', 'car', 'tricycle', 'jeepney', 'van', 'truck', 'bus', 'bicycle', 'other'];
export const VEHICLE_COLORS: Record<VehicleType, string> = {
  car: '#3b82f6', motorcycle: '#a855f7', tricycle: '#ec4899', jeepney: '#f59e0b', bus: '#10b981',
  truck: '#ef4444', van: '#06b6d4', bicycle: '#84cc16', other: '#94a3b8',
};
export const SIGNAL_COLORS: Record<SignalColor, string> = {
  GREEN: '#22c55e', YELLOW: '#eab308', RED: '#ef4444', OFF: '#64748b', FLASHING: '#eab308',
};
export const INT_COLORS = ['#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#a855f7', '#ef4444'];
export const APPROACH_LABEL: Record<Approach, string> = { N: 'North', S: 'South', E: 'East', W: 'West' };
export const APPROACHES: Approach[] = ['N', 'S', 'E', 'W'];

export const AXIS_STYLE = { stroke: '#64748b', fontSize: 12 };
export const TOOLTIP_STYLE = { background: 'var(--color-slate-900)', border: '1px solid var(--color-slate-700)', borderRadius: 8, color: 'var(--color-slate-200)' };
export const GRID = 'var(--color-slate-800)';

export function downloadUrl(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}

export function downloadCsv(name: string, rows: (string | number | null | undefined)[][]) {
  // Quote every cell and neutralise a leading = + - @ so spreadsheets don't run plate/notes text as formulas.
  const esc = (v: unknown) => `"${String(v ?? '').replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  downloadUrl(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterise any image URL (incl. SVG data URLs) to a PNG data URL. */
export const toPng = (src: string, w = 1280, h = 720) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });

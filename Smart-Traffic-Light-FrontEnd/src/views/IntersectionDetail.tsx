import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { CameraTile } from '../components/CameraTile';
import { IntersectionDiagram } from '../components/IntersectionDiagram';
import {
  Async, Card, CongestionBadge, cx, input, SignalLight, StatusBadge, Tabs, td, th, title, TypeChips,
} from '../components/ui';
import { ViolationTable } from '../components/ViolationTable';
import { api, qs, useCameras, useHourly, useSensors } from '../services/api';

import { OPS, useCan } from '../store/auth';
import { subscribe } from '../services/ws';
import { useLive } from '../store/live';
import type { Intersection, LaneStatus, Paginated, SignalState, VehicleType, Violation } from '../types';
import {
  APPROACH_LABEL, APPROACHES, AXIS_STYLE, fmtDateTime, fmtTime, GRID, hourRange, manilaToday, shortHour, TOOLTIP_STYLE, VEHICLE_COLORS, VEHICLE_TYPES,
} from '../utils/format';

const TABS = ['Live', 'Analytics', 'Violations', 'Devices'] as const;

function useLiveIntersection(id: string) {
  const signalQ = useQuery({ queryKey: ['signal', id], queryFn: () => api<SignalState>(`/intersections/${id}/signal`) });
  const lanesQ = useQuery({ queryKey: ['lanes', id], queryFn: () => api<LaneStatus[]>(`/intersections/${id}/lanes`) });
  const signal = useLive((s) => s.signals[id]) ?? signalQ.data;
  const liveLanes = useLive(useShallow((s) => Object.values(s.lanes).filter((l) => l.intersectionId === id)));
  const lanes = (liveLanes.length ? liveLanes : lanesQ.data ?? []).slice().sort((a, b) => APPROACHES.indexOf(a.approach) - APPROACHES.indexOf(b.approach) || a.lane - b.lane);
  return { signal, lanes };
}

function LanePanel({ lanes, signal }: { lanes: LaneStatus[]; signal?: SignalState }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-800">
          <tr>{['Lane', 'Signal', 'Present', 'Distance', 'Passed (5 min)', 'Queue', 'Density', 'Camera counts'].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {lanes.map((l) => {
            const p = signal?.phases.find((x) => x.approach === l.approach);
            return (
              <tr key={`${l.approach}${l.lane}`}>
                <td className={cx(td, 'whitespace-nowrap')}>{APPROACH_LABEL[l.approach]} · L{l.lane}</td>
                <td className={td}>{p ? <SignalLight color={p.color} /> : '—'}</td>
                <td className={td}>{l.sensor.vehiclePresent ? 'Yes' : 'No'}</td>
                <td className={cx(td, 'whitespace-nowrap tabular-nums')}>
                  {l.sensor.distanceLevel === 'NONE' ? '—' : `${title(l.sensor.distanceLevel)} · ${l.sensor.distanceM?.toFixed(1)} m`}
                </td>
                <td className={cx(td, 'tabular-nums')}>{l.sensor.countLast5Min}</td>
                <td className={cx(td, 'tabular-nums')}>{l.queueLength}</td>
                <td className={td}><CongestionBadge level={l.density} /></td>
                <td className={td}><TypeChips counts={l.cameraCounts} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LiveTab({ int }: { int: Intersection }) {
  const cams = useCameras(int.id);
  const { signal, lanes } = useLiveIntersection(int.id);
  const [overlay, setOverlay] = useState(true);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="min-w-0 space-y-4 xl:col-span-2">
        <Card title="Camera channels" actions={
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} />Bounding boxes</label>
        }>
          <Async q={cams} empty={(d) => !d.length} skeleton="h-64">
            {(list) => <div className="grid gap-3 md:grid-cols-2">{list.map((c) => <CameraTile key={c.id} camera={c} label={int.name} overlay={overlay} />)}</div>}
          </Async>
        </Card>
        <Card title="Lanes (ultrasonic sensor + camera)">{lanes.length ? <LanePanel lanes={lanes} signal={signal} /> : <div className="h-32 animate-pulse rounded bg-slate-800" />}</Card>
      </div>
      <div className="space-y-4">
        <Card title="Signal">
          <IntersectionDiagram signal={signal} lanes={lanes} />
        </Card>
      </div>
    </div>
  );
}

function AnalyticsTab({ id }: { id: string }) {
  const [date, setDate] = useState(manilaToday());
  const q = useHourly(id, date);
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        Date
        <input type="date" value={date} max={manilaToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className={input} />
      </label>
      <Async q={q} skeleton="h-96">
        {(hours) => {
          const peak = hours.reduce((a, b) => (b.total > a.total ? b : a));
          const rows = hours.map((h) => ({ hour: shortHour(h.hour), total: h.total, speed: h.total ? h.avgSpeedKph : null, ...h.byType }));
          return (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card title="Hourly volume" actions={<span className="text-xs text-orange-300">Peak: {hourRange(peak.hour)} ({peak.total.toLocaleString()})</span>}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={rows}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="hour" {...AXIS_STYLE} /><YAxis {...AXIS_STYLE} width={44} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID }} />
                    <Bar dataKey="total" name="Vehicles" isAnimationActive={false}>
                      {hours.map((h) => <Cell key={h.hour} fill={h.hour === peak.hour ? '#f97316' : '#38bdf8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Vehicle types per hour">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={rows}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="hour" {...AXIS_STYLE} /><YAxis {...AXIS_STYLE} width={44} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: GRID }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {VEHICLE_TYPES.map((t: VehicleType) => <Bar key={t} dataKey={t} stackId="t" fill={VEHICLE_COLORS[t]} isAnimationActive={false} />)}
                  </BarChart>
                </ResponsiveContainer>
              </Card>
              {/* shortcut: API gives one avg speed per hour, not per approach; split when /traffic/hourly supports approach */}
              <Card title="Average speed (km/h)" className="xl:col-span-2">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={rows}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="hour" {...AXIS_STYLE} /><YAxis {...AXIS_STYLE} width={44} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Line dataKey="speed" name="Avg speed" stroke="#10b981" dot={false} strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            </div>
          );
        }}
      </Async>
    </div>
  );
}

function ViolationsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['violations', { intersectionId: id }], queryFn: () => api<Paginated<Violation>>(`/violations${qs({ intersectionId: id, size: 50 })}`) });
  const evidence = useCan(OPS);
  return <Card><Async q={q} empty={(d) => !d.data.length}>{(d) => <ViolationTable rows={d.data} evidence={evidence} />}</Async></Card>;
}

function DevicesTab({ id }: { id: string }) {
  const cams = useCameras(id);
  const sensors = useSensors(id);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card title="Cameras">
        <Async q={cams} empty={(d) => !d.length}>
          {(list) => (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800"><tr>{['Ch', 'ID', 'Approach', 'Resolution', 'Status', 'Last heartbeat'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {list.map((c) => (
                  <tr key={c.id}>
                    <td className={cx(td, 'tabular-nums')}>{c.channel}</td>
                    <td className={cx(td, 'font-mono text-xs')}>{c.id}</td>
                    <td className={td}>{APPROACH_LABEL[c.approach]}</td>
                    <td className={td}>{c.resolution}</td>
                    <td className={td}><StatusBadge status={c.status} /></td>
                    <td className={cx(td, 'tabular-nums')}>{fmtTime(c.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
      </Card>
      <Card title="Ultrasonic sensors">
        <Async q={sensors} empty={(d) => !d.length}>
          {(list) => (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-800"><tr>{['ID', 'Approach', 'Lane', 'Range', 'Status', 'Last heartbeat'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-800/70">
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className={cx(td, 'font-mono text-xs')}>{s.id}</td>
                    <td className={td}>{APPROACH_LABEL[s.approach]}</td>
                    <td className={cx(td, 'tabular-nums')}>{s.lane}</td>
                    <td className={cx(td, 'tabular-nums')}>{s.maxRangeM} m</td>
                    <td className={td}><StatusBadge status={s.status} /></td>
                    <td className={cx(td, 'tabular-nums')}>{fmtDateTime(s.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
      </Card>
    </div>
  );
}

export default function IntersectionDetail() {
  const id = useParams<{ id: string }>().id;
  const [tab, setTab] = useState<(typeof TABS)[number]>('Live');
  const q = useQuery({ queryKey: ['intersections', id], queryFn: () => api<Intersection>(`/intersections/${id}`), refetchInterval: 5000 });
  useEffect(() => subscribe([`intersection:${id}`]), [id]);

  return (
    <Async q={q} skeleton="h-96">
      {(int) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h1 className="text-xl font-semibold tracking-tight">{int.name}</h1>
              <p className="text-sm text-slate-400">Brgy. {int.barangay} · Speed limit {int.speedLimitKph} km/h</p>
            </div>
            <StatusBadge status={int.status} />
            <CongestionBadge level={int.congestion} />
            <span className="rounded-md border border-slate-700 px-2 py-0.5 text-xs font-semibold tracking-wide">{int.mode}</span>
          </div>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          {tab === 'Live' && <LiveTab int={int} />}
          {tab === 'Analytics' && <AnalyticsTab id={id} />}
          {tab === 'Violations' && <ViolationsTab id={id} />}
          {tab === 'Devices' && <DevicesTab id={id} />}
        </div>
      )}
    </Async>
  );
}

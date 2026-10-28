import type { Detection, DetectionFrame, VehicleType, WsEvent } from '../types';

/**
 * On-screen stand-in for the AI detector. Until a real detector streams boxes, this draws moving vehicle
 * boxes on every ONLINE camera of the cameras you give it, so the Live View has something to show.
 * Nothing here is saved or sent to the server.
 */
const MIX: [VehicleType, number][] = [
  ['motorcycle', 0.35], ['car', 0.25], ['tricycle', 0.15], ['jeepney', 0.1], ['van', 0.06], ['truck', 0.05], ['bus', 0.03], ['other', 0.01],
];
const SIZE: Record<VehicleType, [number, number]> = {
  motorcycle: [0.05, 0.09], bicycle: [0.04, 0.08], tricycle: [0.08, 0.11], car: [0.11, 0.13], van: [0.12, 0.15],
  jeepney: [0.13, 0.18], bus: [0.15, 0.24], truck: [0.15, 0.22], other: [0.08, 0.1],
};
const pickType = (r: number): VehicleType => {
  let acc = 0;
  for (const [t, p] of MIX) if (r < (acc += p)) return t;
  return 'other';
};

type Track = Detection & { vy: number };
type Cam = { id: string; status: string };

/** Emits a `detection.frame` event for each online camera five times a second. Returns a stop function. */
export function startCameraSim(getCameras: () => Cam[], emit: (e: WsEvent) => void) {
  const tracks: Record<string, Track[]> = {};
  let nextTrack = 1;
  const timer = setInterval(() => {
    for (const cam of getCameras()) {
      if (cam.status === 'OFFLINE') continue;
      const list = (tracks[cam.id] = (tracks[cam.id] ?? []).filter((t) => t.bbox[1] < 1));
      for (const t of list) t.bbox[1] += t.vy;
      if (list.length < 8 && Math.random() < 0.12) {
        const type = pickType(Math.random());
        const [w, h] = SIZE[type];
        const speedKph = Math.random() < 0.05 ? 45 + Math.random() * 30 : 15 + Math.random() * 30;
        list.push({
          trackId: nextTrack++, type, confidence: Math.round((0.55 + Math.random() * 0.44) * 10) / 10,
          bbox: [0.25 + Math.random() * (0.5 - w), -h, w, h], speedKph: Math.round(speedKph), vy: speedKph / 1500,
        });
      }
      const detections = list.filter((t) => t.bbox[1] + t.bbox[3] > 0).map(({ vy: _vy, ...d }) => ({ ...d, bbox: [...d.bbox] as Detection['bbox'] }));
      const countsByType: DetectionFrame['countsByType'] = {};
      for (const d of detections) countsByType[d.type] = (countsByType[d.type] ?? 0) + 1;
      emit({ event: 'detection.frame', data: { cameraId: cam.id, timestamp: new Date().toISOString(), detections, countsByType } });
    }
  }, 200);
  return () => clearInterval(timer);
}

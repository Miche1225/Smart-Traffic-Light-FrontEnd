// Models from spec section 6, plus the few shapes the spec names but leaves undefined.
export type VehicleType =
  | 'car' | 'motorcycle' | 'tricycle' | 'jeepney'
  | 'bus' | 'truck' | 'van' | 'bicycle' | 'other';

export type Approach = 'N' | 'S' | 'E' | 'W';
export type SignalColor = 'RED' | 'YELLOW' | 'GREEN' | 'OFF' | 'FLASHING';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED';
export type CongestionLevel = 'LOW' | 'MODERATE' | 'HEAVY' | 'SEVERE';
export type SignalMode = 'ADAPTIVE' | 'FIXED' | 'MANUAL';
export type DistanceLevel = 'NONE' | 'FAR' | 'MID' | 'NEAR';

export interface Intersection {
  id: string;
  name: string;
  barangay: string;
  lat: number;
  lng: number;
  approaches: Approach[];
  mode: SignalMode;
  status: DeviceStatus;
  congestion: CongestionLevel;
  speedLimitKph: number;
}

export interface Camera {
  id: string;
  intersectionId: string;
  channel: number;
  approach: Approach;
  name: string;
  streamUrl: string; // empty = simulated feed (mocks)
  streamType: 'HLS' | 'MJPEG' | 'WEBRTC';
  resolution: string;
  status: DeviceStatus;
  fps: number;
  lastSeen: string;
}

export interface UltrasonicSensor {
  id: string;
  intersectionId: string;
  approach: Approach;
  lane: number;
  maxRangeM: number;
  thresholds: { nearM: number; midM: number; farM: number };
  status: DeviceStatus;
  lastSeen: string;
}

export interface SensorReading {
  sensorId: string;
  timestamp: string;
  vehiclePresent: boolean;
  distanceM: number | null;
  distanceLevel: DistanceLevel;
  countLast5Min: number;
}

export interface Detection {
  trackId: number;
  type: VehicleType;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, w, h — normalized 0..1
  speedKph?: number;
}

export interface DetectionFrame {
  cameraId: string;
  timestamp: string;
  detections: Detection[];
  countsByType: Partial<Record<VehicleType, number>>;
}

export interface SignalState {
  intersectionId: string;
  phases: Array<{ approach: Approach; color: SignalColor; remainingSec: number }>;
  mode: SignalMode;
  updatedAt: string;
}

export interface LaneStatus {
  intersectionId: string;
  approach: Approach;
  lane: number;
  queueLength: number;
  density: CongestionLevel;
  sensor: SensorReading;
  cameraCounts: Partial<Record<VehicleType, number>>;
}

export type ViolationStatus = 'NEW' | 'UNDER_REVIEW' | 'VERIFIED' | 'DISMISSED' | 'ISSUED';

export interface Violation {
  id: string;
  timestamp: string;
  intersectionId: string;
  intersectionName: string;
  cameraId: string;
  approach: Approach;
  lane: number;
  vehicleType: VehicleType;
  speedKph: number;
  limitKph: number;
  plateNumber: string | null;
  confidence: number;
  imageUrl: string;
  extraFrames: string[];
  status: ViolationStatus;
  notes?: string;
  audit: Array<{ at: string; by: string; action: string }>;
}

export type AlertType =
  | 'OVERSPEED' | 'CAMERA_OFFLINE' | 'SENSOR_FAULT'
  | 'HEAVY_CONGESTION' | 'SIGNAL_FAULT';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  type: AlertType;
  severity: Severity;
  intersectionId?: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  refId?: string;
}

export interface HourlyTraffic {
  hour: number;
  total: number;
  byType: Partial<Record<VehicleType, number>>;
  avgSpeedKph: number;
}

export interface DailySummaryReport {
  date: string;
  intersectionId: string | 'ALL';
  totalVehicles: number;
  peakHour: { hour: number; count: number };
  top3Hours: Array<{ hour: number; count: number }>;
  quietestHour: { hour: number; count: number };
  byType: Partial<Record<VehicleType, number>>;
  hourly: HourlyTraffic[];
  heatmap: Array<{ intersectionId: string; name: string; hourly: number[] }>;
  overspeedCount: number;
  topViolationLocations: Array<{ intersectionId: string; name: string; count: number }>;
  avgWaitSec: number;
  avgWaitByIntersection: Array<{ intersectionId: string; name: string; avgWaitSec: number }>;
  deviceUptimePct: number;
}

export interface WeeklyReport {
  start: string;
  intersectionId: string | 'ALL';
  days: Array<{ date: string; hourly: number[] }>;
}

export type Role = 'ADMIN' | 'OPERATOR' | 'VIEWER';
export interface User { id: string; username: string; name: string; role: Role }
/** A user as listed for administrators. */
export interface UserAccount extends User { createdAt: string }

export interface Paginated<T> { data: T[]; page: number; size: number; total: number }

export interface DashboardKpi {
  vehiclesToday: number;
  vehiclesYesterdaySameTime: number;
  peakIntersection: { id: string; name: string; perMin: number };
  overspeedToday: number;
  lastOverspeedAt: string | null;
  camerasOnline: number;
  camerasTotal: number;
  offlineCameras: string[];
  sensorsOnline: number;
  sensorsTotal: number;
  avgWaitSec: number;
}

export interface DeviceStatusEvent { id: string; kind: 'camera' | 'sensor'; status: DeviceStatus; lastSeen: string }

export type WsEvent =
  | { event: 'detection.frame'; data: DetectionFrame }
  | { event: 'sensor.reading'; data: SensorReading }
  | { event: 'signal.state'; data: SignalState }
  | { event: 'lane.status'; data: LaneStatus }
  | { event: 'violation.new'; data: Violation }
  | { event: 'alert.new'; data: Alert }
  | { event: 'device.status'; data: DeviceStatusEvent }
  | { event: 'dashboard.kpi'; data: DashboardKpi };

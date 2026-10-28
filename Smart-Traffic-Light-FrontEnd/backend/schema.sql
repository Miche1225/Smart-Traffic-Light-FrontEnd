-- SMART Traffic Light - MySQL schema
-- Open this file in MySQL Workbench and run it (lightning bolt) to create the database by hand,
-- or just start the backend: it runs this same file automatically (npm run backend).

CREATE DATABASE IF NOT EXISTS smart_traffic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_traffic;

-- Small key/value table the app uses to remember things like "sample data was already loaded".
CREATE TABLE IF NOT EXISTS app_meta (
  k VARCHAR(40)  PRIMARY KEY,
  v VARCHAR(200) NOT NULL
);

-- People who can sign in. Self-registration creates VIEWER accounts; an ADMIN can promote them.
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  name          VARCHAR(60)  NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'VIEWER',   -- ADMIN | OPERATOR | VIEWER
  created_at    DATETIME(3)  NOT NULL
);

-- A monitored junction.
CREATE TABLE IF NOT EXISTS intersections (
  id              VARCHAR(12)  PRIMARY KEY,                -- INT-001, INT-002, ...
  name            VARCHAR(100) NOT NULL,
  barangay        VARCHAR(60)  NOT NULL DEFAULT '',
  lat             DOUBLE       NOT NULL DEFAULT 0,
  lng             DOUBLE       NOT NULL DEFAULT 0,
  mode            VARCHAR(10)  NOT NULL DEFAULT 'ADAPTIVE', -- ADAPTIVE | FIXED | MANUAL
  speed_limit_kph INT          NOT NULL DEFAULT 40,
  traffic_scale   DOUBLE       NOT NULL DEFAULT 1,          -- how busy this junction is (used by the traffic model)
  created_at      DATETIME(3)  NOT NULL
);

-- High-definition camera channels (one row per channel on an intersection).
CREATE TABLE IF NOT EXISTS cameras (
  id              VARCHAR(20)  PRIMARY KEY,                -- CAM-001-1
  intersection_id VARCHAR(12)  NOT NULL,
  channel         INT          NOT NULL,
  approach        CHAR(1)      NOT NULL,                   -- N | S | E | W
  name            VARCHAR(100) NOT NULL,
  stream_url      VARCHAR(500) NOT NULL DEFAULT '',        -- empty = simulated feed
  stream_type     VARCHAR(10)  NOT NULL DEFAULT 'HLS',
  resolution      VARCHAR(12)  NOT NULL DEFAULT '1920x1080',
  status          VARCHAR(10)  NOT NULL DEFAULT 'ONLINE',  -- ONLINE | OFFLINE | DEGRADED
  fps             INT          NOT NULL DEFAULT 25,
  last_seen       DATETIME(3)  NOT NULL,
  CONSTRAINT fk_cam_int FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

-- Ultrasonic sensor registry (device list only; live readings come from the hardware later).
CREATE TABLE IF NOT EXISTS sensors (
  id              VARCHAR(20)  PRIMARY KEY,                -- US-001-N1
  intersection_id VARCHAR(12)  NOT NULL,
  approach        CHAR(1)      NOT NULL,
  lane            INT          NOT NULL DEFAULT 1,
  max_range_m     DOUBLE       NOT NULL DEFAULT 4.5,
  near_m          DOUBLE       NOT NULL DEFAULT 1.5,
  mid_m           DOUBLE       NOT NULL DEFAULT 3,
  far_m           DOUBLE       NOT NULL DEFAULT 4.5,
  status          VARCHAR(10)  NOT NULL DEFAULT 'ONLINE',
  last_seen       DATETIME(3)  NOT NULL,
  CONSTRAINT fk_sen_int FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

-- Completed hours of vehicle counts per intersection (the dashboard and reports read this).
CREATE TABLE IF NOT EXISTS traffic_hourly (
  intersection_id VARCHAR(12) NOT NULL,
  day             DATE        NOT NULL,                    -- calendar day in Asia/Manila
  hour            TINYINT     NOT NULL,                    -- 0..23
  total           INT         NOT NULL,
  by_type         TEXT        NOT NULL,                    -- JSON: {"car":12,"motorcycle":30,...}
  avg_speed_kph   INT         NOT NULL,
  PRIMARY KEY (intersection_id, day, hour),
  CONSTRAINT fk_tr_int FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE
);

-- Over-speeding captures.
CREATE TABLE IF NOT EXISTS violations (
  id              INT AUTO_INCREMENT PRIMARY KEY,          -- shown as VIO-00001
  ts              DATETIME(3)  NOT NULL,                   -- UTC
  intersection_id VARCHAR(12)  NOT NULL,
  camera_id       VARCHAR(20)  NULL,
  approach        CHAR(1)      NOT NULL,
  lane            INT          NOT NULL DEFAULT 1,
  vehicle_type    VARCHAR(12)  NOT NULL,
  speed_kph       DOUBLE       NOT NULL,
  limit_kph       DOUBLE       NOT NULL,
  plate_number    VARCHAR(12)  NULL,
  confidence      DOUBLE       NOT NULL DEFAULT 1,
  image_url       MEDIUMTEXT   NOT NULL,
  extra_frames    MEDIUMTEXT   NOT NULL,                   -- JSON array of image URLs
  status          VARCHAR(12)  NOT NULL DEFAULT 'NEW',     -- NEW | UNDER_REVIEW | VERIFIED | DISMISSED | ISSUED
  notes           TEXT         NULL,
  CONSTRAINT fk_vio_int FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE CASCADE,
  CONSTRAINT fk_vio_cam FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS violation_audit (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  violation_id INT          NOT NULL,
  happened_at  DATETIME(3)  NOT NULL,
  by_name      VARCHAR(60)  NOT NULL,
  action       VARCHAR(200) NOT NULL,
  CONSTRAINT fk_aud_vio FOREIGN KEY (violation_id) REFERENCES violations(id) ON DELETE CASCADE
);

-- Faults and warnings that someone should look at.
CREATE TABLE IF NOT EXISTS alerts (
  id              INT AUTO_INCREMENT PRIMARY KEY,          -- shown as ALR-00001
  type            VARCHAR(20)  NOT NULL,                   -- OVERSPEED | CAMERA_OFFLINE | SENSOR_FAULT | HEAVY_CONGESTION | SIGNAL_FAULT
  severity        VARCHAR(10)  NOT NULL,                   -- INFO | WARNING | CRITICAL
  intersection_id VARCHAR(12)  NULL,
  message         VARCHAR(300) NOT NULL,
  ts              DATETIME(3)  NOT NULL,
  acknowledged    TINYINT      NOT NULL DEFAULT 0,
  ref_id          VARCHAR(20)  NULL,
  CONSTRAINT fk_alr_int FOREIGN KEY (intersection_id) REFERENCES intersections(id) ON DELETE SET NULL
);

CREATE INDEX idx_violations_ts  ON violations (ts);
CREATE INDEX idx_violations_int ON violations (intersection_id);
CREATE INDEX idx_alerts_ts      ON alerts (ts);

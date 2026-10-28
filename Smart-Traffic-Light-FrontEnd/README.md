# SMART Traffic Light — LGU Dashboard

Community (LGU) traffic dashboard: camera channels per intersection, vehicle type and count, over-speeding capture and a
daily summary of the busiest hours. Arduino ultrasonic sensors plug in over USB (see `arduino/`).

| Layer    | Technology                                     |
| -------- | ---------------------------------------------- |
| Frontend | Next.js 15 (App Router) · React 19 · Tailwind CSS 4 |
| Backend  | Node.js · Express 5 (`backend/server.cjs`)     |
| Database | MySQL (design/inspect it in MySQL Workbench)   |

## Run it

You need **Node.js 22+** and a running **MySQL Server** (with MySQL Workbench if you want to browse the data).

```bash
npm install
```

1. **Tell the backend how to reach MySQL.** Copy `backend/.env.example` to `backend/.env` and fill it in
   (the important lines are `JWT_SECRET`, `BOOTSTRAP_ADMIN_USERNAME`/`PASSWORD` and your MySQL `DB_PASSWORD`).
   `backend/.env` is ignored by Git, so your passwords stay on your computer.
2. **Start the API** (terminal 1). The first run creates the `smart_traffic` database, the tables
   (`backend/schema.sql`) and some sample intersections, cameras, violations and alerts:
   ```bash
   npm run backend
   ```
   Prefer to see the tables first? Open `backend/schema.sql` in MySQL Workbench and run it, then start the API.
3. **Start the website** (terminal 2): `npm run dev` → http://localhost:3000

Sign in with the administrator from `backend/.env`, or press **Create account** (new accounts are *viewers*; an admin can
promote them in **Settings → Users**).

Other scripts: `npm run db:init` (create/seed the database and exit) · `npm run build` (type-check + production build) ·
`npm run check` (signal and peak-hour self-check).

### Demo mode without a backend

Create `.env.local` with `NEXT_PUBLIC_USE_MOCKS=true` and `npm run dev`. Everything runs on fake in-browser data
(logins `admin`, `operator`, `viewer`, password `password`). Nothing is saved.

## What is in the prototype

**Pages** — Home/landing (`/` when signed out) · Login · Register · Dashboard (`/`) · Live View · Intersections (+ detail) ·
Violations (+ detail) · Reports · Alerts · Settings (cameras, users, Arduino).

**CRUD on MySQL data**

| Record        | Create                       | Read                         | Update                          | Delete                       |
| ------------- | ---------------------------- | ---------------------------- | ------------------------------- | ---------------------------- |
| Intersections | Intersections → Add          | Intersections, Dashboard     | Intersections → Edit            | Intersections → Delete       |
| Violations    | Violations → Record violation | Violations, Dashboard        | Violation page (status, plate, notes) | Violation page → Delete |
| Alerts        | Alerts → New alert           | Alerts, top-bar bell         | Acknowledge / Edit              | Alerts → Delete              |
| Cameras       | Settings → Add camera        | Live View, Settings          | Settings → Edit                 | Settings → Delete            |
| Users         | Register, Settings → Add user | Settings → Users            | Settings → change role          | Settings → Delete            |

**Roles** — `ADMIN` (everything), `OPERATOR` (review violations, alerts), `VIEWER` (dashboards and reports; evidence photos
and plate numbers are hidden under RA 10173).

## API (`/api/v1`, JSON, `Authorization: Bearer <token>`)

```
GET    /health
POST   /auth/register            POST /auth/login            GET /auth/me
GET    /users                    POST /users                 PATCH /users/:id        DELETE /users/:id       (admin)
GET    /dashboard/summary
GET    /intersections            POST /intersections         GET/PATCH/DELETE /intersections/:id
GET    /intersections/:id/signal GET /intersections/:id/lanes
GET    /cameras                  POST /cameras               GET/PATCH/DELETE /cameras/:id
GET    /sensors                  POST /sensors               PATCH/DELETE /sensors/:id
GET    /traffic/hourly?intersectionId=&date=
GET    /reports/daily?date=&intersectionId=                  GET /reports/weekly?start=&intersectionId=
GET    /violations?from=&to=&intersectionId=&type=&status=&minSpeed=&maxSpeed=&page=&size=
POST   /violations               GET/PATCH/DELETE /violations/:id
GET    /alerts?ack=&type=&severity=&intersectionId=          POST /alerts   PATCH /alerts/:id   POST /alerts/:id/ack   DELETE /alerts/:id
```

Tables: `users`, `intersections`, `cameras`, `sensors`, `traffic_hourly`, `violations`, `violation_audit`, `alerts`, `app_meta`.

## Honest notes about the data

* **Vehicle counts** are generated from a typical Philippine daily pattern (AM peak 7–9, PM peak 5–7) and then stored in
  `traffic_hourly`, so charts and the peak-hour report read real MySQL rows. Replace the generator in `backend/lib.cjs`
  with counts from the camera detector when it is ready.
* **Evidence photos** of seeded/recorded violations are placeholder pictures. **Camera boxes** in Live View come from an
  on-screen simulation (`src/services/cameraSim.ts`); nothing is sent to the server.
* **Signal timing and lane sensors** show a software cycle and "idle" readings until the Arduino is connected
  (Settings → Connect Arduino, Chrome/Edge).

Routes live in `src/app/`, screens in `src/views/`; `src/middleware.ts` redirects signed-out users and enforces page roles
from the `stl-role` cookie set at login. The API checks the token and role again on every request.

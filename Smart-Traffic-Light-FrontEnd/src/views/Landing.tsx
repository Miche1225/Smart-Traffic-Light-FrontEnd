import { BellRing, FileBarChart, Gauge, LayoutDashboard, LogIn, Radar, TrafficCone, UserPlus, Video } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { btn, btnPrimary, cx, Logo } from '../components/ui';
import { useAuth } from '../store/auth';

const FEATURES: { icon: typeof Video; title: string; text: string }[] = [
  { icon: Video, title: 'Camera channels per intersection', text: 'Every junction has its own set of camera channels, shown together on one dashboard with live vehicle boxes.' },
  { icon: TrafficCone, title: 'Vehicle type and count', text: 'Cars, motorcycles, tricycles, jeepneys, buses and trucks are counted per hour, per intersection.' },
  { icon: Gauge, title: 'Over-speeding capture', text: 'Vehicles above the speed limit are recorded with photos, plate number and a review trail.' },
  { icon: Radar, title: 'Ultrasonic lane sensing', text: 'Sensors per lane report how many vehicles are waiting and how close they are. The hardware plugs in over USB.' },
  { icon: BellRing, title: 'Alerts', text: 'Offline cameras, faulty sensors, heavy congestion and signal faults are listed for someone to check.' },
  { icon: FileBarChart, title: 'Daily summary report', text: 'Busiest hours, quietest hours and vehicle mix for each day or week, ready to export as CSV or PDF.' },
];

const STEPS = [
  ['1', 'Detect', 'Cameras and sensors watch each approach of the intersection.'],
  ['2', 'Store', 'Counts, violations and alerts are saved in the MySQL database through the Express API.'],
  ['3', 'Act', 'LGU staff review the dashboard, verify violations and read the peak-hour report.'],
];

function Section({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <h2 className="text-2xl font-semibold tracking-tight text-slate-100">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function Landing() {
  const token = useAuth((s) => s.token);
  // After mount only: the server render has no saved sign-in, so the buttons would flash otherwise.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(!!token), [token]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#10203d] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <div className="mr-auto leading-tight">
            <div className="font-bold">SMART Traffic Light</div>
            <div className="hidden text-xs text-white/60 sm:block">LGU Monitoring Dashboard</div>
          </div>
          <a href="#features" className="hidden text-sm text-white/70 hover:text-white sm:block">Features</a>
          <a href="#how" className="hidden text-sm text-white/70 hover:text-white sm:block">How it works</a>
          {signedIn ? (
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-md bg-[#fbbf24] px-3 py-1.5 text-sm font-semibold text-[#10203d] hover:bg-[#fcd34d]"><LayoutDashboard className="size-4" />Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white">Sign in</Link>
              <Link href="/register" className="rounded-md bg-[#fbbf24] px-3 py-1.5 text-sm font-semibold text-[#10203d] hover:bg-[#fcd34d]">Create account</Link>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="bg-[#10203d] text-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr] md:py-20">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#fbbf24]">Local Government Unit · Traffic Management</p>
              <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Smarter signals.<br />Safer streets.</h1>
              <p className="mt-4 max-w-xl text-[17px] text-white/75">
                A traffic dashboard for the community: it counts and classifies vehicles from camera images, senses queues with ultrasonic sensors,
                captures over-speeding vehicles and reports the busiest hours of every day.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {signedIn ? (
                  <Link href="/" className={cx(btnPrimary, 'px-5 py-2.5')}><LayoutDashboard className="size-4" />Open dashboard</Link>
                ) : (
                  <>
                    <Link href="/login" className={cx(btnPrimary, 'px-5 py-2.5')}><LogIn className="size-4" />Sign in</Link>
                    <Link href="/register" className={cx(btn, 'border-white/30 bg-white/10 px-5 py-2.5 text-white hover:bg-white/20')}><UserPlus className="size-4" />Create account</Link>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center gap-8" aria-hidden>
              <div className="flex flex-col gap-3 rounded-3xl border border-slate-700 bg-slate-950 p-4 shadow-2xl shadow-black/60">
                <span className="size-14 rounded-full bg-red-500 shadow-[0_0_28px_6px] shadow-red-500/60 motion-safe:animate-lamp-red" />
                <span className="size-14 rounded-full bg-yellow-400 opacity-15 shadow-[0_0_28px_6px] shadow-yellow-400/60 motion-safe:animate-lamp-yellow" />
                <span className="size-14 rounded-full bg-green-500 opacity-15 shadow-[0_0_28px_6px] shadow-green-500/60 motion-safe:animate-lamp-green" />
              </div>
              <dl className="space-y-4 text-white/90">
                {[['Per hour', 'vehicle counts'], ['Per junction', 'camera channels'], ['CSV · PDF', 'report export']].map(([v, k]) => (
                  <div key={k}><dt className="text-xs uppercase tracking-wide text-white/50">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <Section id="features" title="What it does">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-lg border border-slate-800 bg-slate-900 p-4 shadow-sm shadow-black/10">
                <span className="grid size-10 place-items-center rounded-md bg-sky-500/15 text-sky-400"><f.icon className="size-5" /></span>
                <h3 className="mt-3 font-semibold text-slate-100">{f.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{f.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how" title="How it works">
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map(([n, t, d]) => (
              <li key={n} className="flex gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fbbf24] font-bold text-[#10203d]">{n}</span>
                <div><h3 className="font-semibold text-slate-100">{t}</h3><p className="mt-1 text-sm text-slate-400">{d}</p></div>
              </li>
            ))}
          </ol>
        </Section>
      </main>

      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500">
        SMART Traffic Light · Next.js, Tailwind CSS, Node.js, Express and MySQL · Data handled in accordance with RA 10173 (Data Privacy Act).
      </footer>
    </div>
  );
}

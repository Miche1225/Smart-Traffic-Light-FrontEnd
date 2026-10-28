import { BellRing, Gauge, Video } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/** Navy brand panel on the left (large screens) and the form on the right; shared by sign in and register. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden bg-[#10203d] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="relative text-xs font-semibold uppercase tracking-wider text-[#fbbf24]">Local Government Unit · Traffic Management</div>
        <div className="relative flex items-center gap-12">
          <div className="flex flex-col gap-3 rounded-3xl border border-slate-700 bg-slate-950 p-4 shadow-2xl shadow-black/60" aria-hidden>
            <span className="size-14 rounded-full bg-red-500 shadow-[0_0_28px_6px] shadow-red-500/60 motion-safe:animate-lamp-red" />
            <span className="size-14 rounded-full bg-yellow-400 opacity-15 shadow-[0_0_28px_6px] shadow-yellow-400/60 motion-safe:animate-lamp-yellow" />
            <span className="size-14 rounded-full bg-green-500 opacity-15 shadow-[0_0_28px_6px] shadow-green-500/60 motion-safe:animate-lamp-green" />
          </div>
          <div>
            <h2 className="text-4xl font-bold leading-tight tracking-tight">Smarter signals.<br />Safer streets.</h2>
            <ul className="mt-6 space-y-3 text-[15px] text-white/80">
              <li className="flex items-center gap-3"><Video className="size-4 text-[#fbbf24]" />Live AI vehicle detection on every camera</li>
              <li className="flex items-center gap-3"><Gauge className="size-4 text-[#fbbf24]" />Automatic over-speeding evidence capture</li>
              <li className="flex items-center gap-3"><BellRing className="size-4 text-[#fbbf24]" />Real-time alerts for faults and congestion</li>
            </ul>
          </div>
        </div>
        <p className="relative text-xs text-white/50">Data handled in accordance with RA 10173 (Data Privacy Act).</p>
      </aside>
      <div className="grid place-items-center p-4">
        <div className="w-full max-w-sm">
          {children}
          <p className="mt-4 text-center text-xs text-slate-500"><Link href="/home" className="hover:text-slate-300 hover:underline">← Back to home page</Link></p>
        </div>
      </div>
    </div>
  );
}

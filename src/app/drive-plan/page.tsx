import type { Metadata } from "next";
import Link from "next/link";
import { Route, Clock, Navigation, Radar, Sparkles, CheckCircle2, MapPin } from "lucide-react";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Drive Plan (Coming Soon) – Multi-Machine Drop Route Efficiency",
  description:
    "Coming Soon: PackRadar's drivable route efficiency planner chains nearby Pokémon TCG vending machines so you arrive right as each machine's drop timer unlocks.",
};
export const dynamic = "force-dynamic";

const PREVIEW_STOPS = [
  {
    order: 1,
    code: "Q01124",
    name: "Safeway · 95 82nd Dr, Gladstone",
    drive: "Start · 1.8 mi (4 min drive)",
    dropTime: "2:42 PM",
    arriveTime: "2:39 PM",
    wait: "3 min wait",
    accuracy: 94,
  },
  {
    order: 2,
    code: "Q00137",
    name: "Safeway · 14840 SE Webster Rd, Milwaukie",
    drive: "2.4 mi (6 min drive)",
    dropTime: "2:54 PM",
    arriveTime: "2:51 PM",
    wait: "3 min wait",
    accuracy: 91,
  },
  {
    order: 3,
    code: "Q01304",
    name: "Safeway · 13434 Colton Pl, Oregon City",
    drive: "4.1 mi (9 min drive)",
    dropTime: "3:12 PM",
    arriveTime: "3:09 PM",
    wait: "3 min wait",
    accuracy: 92,
  },
];

export default async function DrivePlanPage() {
  const u = await getCurrentUser();

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-12">
      {/* Hero Banner */}
      <div className="card relative overflow-hidden border-volt/40 bg-gradient-to-br from-yellow-500/15 via-panel to-panel p-6 sm:p-10">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
            <Sparkles className="h-3.5 w-3.5" /> Coming Soon
          </span>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-black text-white sm:text-5xl">
            <Route className="h-9 w-9 text-volt" /> Drivable Multi-Machine Route Efficiency
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            We&apos;re calibrating community drop times across every corridor first. Once unlocked,{" "}
            <b className="text-white">Drive Plan</b> calculates the exact driving time between nearby Pokémon TCG
            vending machines and chains them into a single loop so you pull into each parking lot{" "}
            <span className="font-semibold text-volt">2–3 minutes before its hourly drop unlocks</span>.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!u ? (
              <Link href="/sign-up" className="btn-primary">
                Create Free Account for Early Access
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-300">
                <CheckCircle2 className="h-4 w-4" /> You&apos;re on the early-access list ({u.email})
              </span>
            )}
            <Link href="/map" className="btn-ghost">
              <MapPin className="h-4 w-4" /> Explore Live Map &amp; Report Drops
            </Link>
          </div>
        </div>
      </div>

      {/* Preview of how Drive Plan works */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-volt">Interactive Preview</span>
              <h2 className="text-xl font-bold text-white">Sample Time-Synced Route Loop</h2>
            </div>
            <span className="rounded-full border border-volt/30 bg-volt/10 px-2.5 py-0.5 text-xs font-bold text-volt">
              Coming Soon
            </span>
          </div>
          <p className="text-xs text-muted">
            Example 45-minute corridor run chaining 3 machines whose drop timers are staggered by 12–18 minutes:
          </p>

          <ol className="divide-y divide-line">
            {PREVIEW_STOPS.map((s) => (
              <li key={s.code} className="flex items-center justify-between gap-3 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-volt text-xs font-black text-slate-950">
                    {s.order}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <p className="text-xs text-muted">
                      {s.drive} · {s.wait} · <span className="text-green-400">{s.accuracy}% accuracy</span>
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-green-400">Drop {s.dropTime}</p>
                  <p className="text-xs text-muted">Arrive {s.arriveTime}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          {[
            {
              icon: <Clock className="h-5 w-5" />,
              title: "Arrival Synced to the Exact Drop Minute",
              body: "No more sitting in front of a machine for 45 minutes. The solver pairs travel distance with each machine's anchor minute so you arrive right before the drip timer unlocks.",
            },
            {
              icon: <Radar className="h-5 w-5" />,
              title: "Weighted by Community Accuracy",
              body: "Prioritizes machines with 85%+ crowd-confirmed accuracy and skips broken or out-of-stock kiosks automatically.",
            },
            {
              icon: <Navigation className="h-5 w-5" />,
              title: "One-Tap Google Maps & Apple Maps Handoff",
              body: "Exports your multi-stop waypoints directly into your phone's navigation app with 1-tap Hit/Miss check-ins at each stop.",
            },
          ].map((f) => (
            <div key={f.title} className="card flex items-start gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-volt/10 text-volt">
                {f.icon}
              </span>
              <div>
                <h3 className="font-bold text-white">{f.title}</h3>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  Route,
  Clock,
  Navigation,
  Radar,
  Sparkles,
  CheckCircle2,
  MapPin,
  Lock,
  ExternalLink,
} from "lucide-react";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/session";
import { getUserReferralSummary } from "@/lib/referrals";
import { searchMachines } from "@/lib/queries";
import { ReferralCard } from "@/components/ReferralCard";

export const metadata: Metadata = {
  title: "Drive Plan – Multi-Machine Drop Route Loop",
  description:
    "PackRadar's drivable route efficiency planner chains nearby Pokémon TCG vending machines so you arrive right as each machine's drop timer unlocks.",
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

export default async function DrivePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ zip?: string }>;
}) {
  const sp = await searchParams;
  const u = await getCurrentUser();
  const db = await getDb();
  const refSummary = u ? await getUserReferralSummary(db, u.id, u.name) : null;

  const isUnlocked = Boolean(
    u && (refSummary?.tier1Unlocked || u.plan === "premium" || u.role === "admin"),
  );

  const activeZip = (sp?.zip || u?.homeZip || "97027").trim();
  const routeSearch = isUnlocked ? await searchMachines(activeZip) : null;

  // Build an ordered 4-stop staggered drive loop sorted by anchorMinute with >=10m gaps
  const liveLoopStops: {
    id: string;
    retailer: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    anchorMinute: number;
    accuracy: number;
    distance: number | null;
  }[] = [];

  if (routeSearch && routeSearch.machines.length > 0) {
    const withAnchor = routeSearch.machines
      .filter((m) => m.anchorMinute != null && m.status === "active")
      .slice(0, 12)
      .sort((a, b) => (a.anchorMinute ?? 0) - (b.anchorMinute ?? 0));

    for (const m of withAnchor) {
      if (liveLoopStops.length === 0) {
        liveLoopStops.push({
          id: m.id,
          retailer: m.retailer,
          street: m.street,
          city: m.city,
          state: m.state,
          zip: m.zip,
          anchorMinute: m.anchorMinute ?? 0,
          accuracy: Math.round(m.accuracy ?? 85),
          distance: m.distance ?? null,
        });
      } else {
        const prev = liveLoopStops[liveLoopStops.length - 1];
        if ((m.anchorMinute ?? 0) - prev.anchorMinute >= 9 && liveLoopStops.length < 5) {
          liveLoopStops.push({
            id: m.id,
            retailer: m.retailer,
            street: m.street,
            city: m.city,
            state: m.state,
            zip: m.zip,
            anchorMinute: m.anchorMinute ?? 0,
            accuracy: Math.round(m.accuracy ?? 85),
            distance: m.distance ?? null,
          });
        }
      }
    }
    if (liveLoopStops.length < 2) {
      for (const m of withAnchor.slice(0, 4)) {
        if (!liveLoopStops.some((s) => s.id === m.id)) {
          liveLoopStops.push({
            id: m.id,
            retailer: m.retailer,
            street: m.street,
            city: m.city,
            state: m.state,
            zip: m.zip,
            anchorMinute: m.anchorMinute ?? 0,
            accuracy: Math.round(m.accuracy ?? 85),
            distance: m.distance ?? null,
          });
        }
      }
    }
  }

  const googleMapsLoopUrl =
    liveLoopStops.length >= 2
      ? `https://www.google.com/maps/dir/${liveLoopStops
          .map((s) => encodeURIComponent(`${s.retailer}, ${s.street}, ${s.city}, ${s.state} ${s.zip}`))
          .join("/")}`
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      {/* Hero Banner */}
      <div className="card relative overflow-hidden border-volt/40 bg-gradient-to-br from-yellow-500/15 via-panel to-panel p-6 sm:p-10">
        <div className="max-w-3xl space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
            <Sparkles className="h-3.5 w-3.5" />{" "}
            {isUnlocked ? "Unlocked Early Access" : "Invite 1 Friend to Unlock Early Access"}
          </span>
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-black text-white sm:text-5xl">
            <Route className="h-9 w-9 text-volt" /> Drivable Multi-Machine Route Loop
          </h1>
          <p className="text-base leading-relaxed text-slate-300">
            <b className="text-white">Drive Plan</b> chains nearby Pokémon TCG vending machines with staggered hourly
            anchor minutes into a single 60-minute loop — so you pull into each parking lot{" "}
            <span className="font-semibold text-volt">2–3 minutes before its drop timer unlocks</span>.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {!u ? (
              <Link href="/sign-up?next=%2Fdrive-plan" className="btn-primary">
                Create Free Account to Get Invite Link
              </Link>
            ) : isUnlocked ? (
              <span className="inline-flex items-center gap-2 rounded-xl border border-green-500/40 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-300">
                <CheckCircle2 className="h-4 w-4" /> Multi-Machine Drive Route Unlocked (@{u.name})
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-xl border border-volt/40 bg-volt/10 px-4 py-2.5 text-sm font-semibold text-volt">
                <Lock className="h-4 w-4" /> Refer 1 hunting buddy below to unlock your custom ZIP route loop!
              </span>
            )}
            <Link href="/map" className="btn-ghost">
              <MapPin className="h-4 w-4" /> Explore Live Map
            </Link>
          </div>
        </div>
      </div>

      {/* Referral Loop Unlock Card */}
      <ReferralCard summary={refSummary} />

      {/* Live Custom Route Builder (when unlocked!) */}
      {isUnlocked && (
        <div className="card space-y-5 border-emerald-400/40 bg-gradient-to-br from-emerald-500/10 via-panel to-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                ⚡ Live Staggered Corridor Loop
              </span>
              <h2 className="text-2xl font-black text-white">
                60-Minute Multi-Machine Run near {routeSearch?.center?.label || activeZip}
              </h2>
            </div>
            <form action="/drive-plan" method="GET" className="flex items-center gap-2">
              <input
                type="text"
                name="zip"
                defaultValue={activeZip}
                placeholder="Enter ZIP or City…"
                className="input w-44 py-2 text-sm text-white"
              />
              <button type="submit" className="btn-primary py-2 text-xs font-extrabold">
                Build Route
              </button>
            </form>
          </div>

          {liveLoopStops.length === 0 ? (
            <p className="text-sm text-muted">
              No active vending kiosks found near <b>{activeZip}</b>. Try another ZIP or metro corridor!
            </p>
          ) : (
            <>
              <ol className="divide-y divide-line">
                {liveLoopStops.map((s, idx) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-volt text-xs font-black text-slate-950">
                        {idx + 1}
                      </span>
                      <div>
                        <Link
                          href={`/machines/${s.id}`}
                          className="text-sm font-bold text-white hover:text-volt"
                        >
                          {s.retailer} · {s.street}, {s.city}
                        </Link>
                        <p className="text-xs text-muted">
                          {s.distance != null ? `${s.distance.toFixed(1)} mi from center · ` : ""}
                          <span className="text-emerald-400">{s.accuracy}% accuracy</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-black text-volt">
                        Drops at :{String(s.anchorMinute).padStart(2, "0")}
                      </p>
                      <p className="text-xs text-muted">
                        Arrive by :{String((s.anchorMinute + 57) % 60).padStart(2, "0")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {googleMapsLoopUrl && (
                <div className="pt-2">
                  <a
                    href={googleMapsLoopUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary inline-flex items-center gap-2 text-xs font-black"
                  >
                    <Navigation className="h-4 w-4" /> Open {liveLoopStops.length}-Stop Loop in Google Maps{" "}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Preview of how Drive Plan works */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-volt">Example Loop</span>
              <h2 className="text-xl font-bold text-white">Sample Time-Synced Route Loop</h2>
            </div>
            <span className="rounded-full border border-volt/30 bg-volt/10 px-2.5 py-0.5 text-xs font-bold text-volt">
              3 Stops / 45 Min
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

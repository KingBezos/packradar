import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { getMachineDetail } from "@/lib/queries";
import { getCurrentUser, isStaff } from "@/lib/session";
import { machineSchedule, candidateSchedule } from "@/lib/drops/engine";
import { buildRouteCorridors } from "@/lib/drops/clusters";
import { describeSchedule } from "@/lib/drops/schedule";
import { LiveDropStatus } from "@/components/live";
import { AccuracyMeter } from "@/components/AccuracyMeter";
import { CommentForm, CommentFlagButton, MachineActions, StockButtons, type CandidateView } from "@/components/MachineActions";
import { MachineProductsCard } from "@/components/MachineProductsCard";
import { getMachineVendedProducts } from "@/lib/vending-storage";
import { getDb } from "@/db";
import { DropMapClient } from "@/components/DropMapClient";
import { MachineCard } from "@/components/MachineCard";
import { SponsorSlot } from "@/components/SponsorSlot";
import { AlertAdminButton } from "@/components/AlertAdminButton";
import { Avatar, SectionTitle, reputationBadge, timeAgo } from "@/components/ui";
import { toMapMachine } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await getMachineDetail(id);
  if (!d) return { title: "Machine not found" };
  const m = d.machine;
  return {
    title: `${m.retailer} Pokémon vending machine – ${m.city}, ${m.state} drop time`,
    description: `Pokémon TCG vending machine at ${m.street}, ${m.city}, ${m.state}. Live drop countdown, crowd-confirmed accuracy and recent drop reports.`,
  };
}

export default async function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const d = await getMachineDetail(id, user?.id);
  if (!d) notFound();
  const { machine: m } = d;
  const db = await getDb();
  const vendedProducts = await getMachineVendedProducts(db, m);
  const sched = machineSchedule(m);
  const corridors = buildRouteCorridors([m, ...d.nearby]);
  const activeCorridor = corridors.find((c) => c.members.some((stop) => stop.id === m.id));

  const cands: CandidateView[] = d.candidates.map((c) => ({
    id: c.id,
    intervalMinutes: c.intervalMinutes,
    anchorMinute: c.anchorMinute,
    source: c.source,
    accuracy: c.verified ? 100 : c.accuracy,
    verified: c.verified,
    confirms: c.confirms,
    disputes: c.disputes,
    matching: c.matchingObservations,
    supporters: c.supporters,
    isActive: c.id === m.activeCandidateId,
    sourceUrl: c.sourceUrl,
    sourceTitle: c.sourceTitle,
    description: describeSchedule(candidateSchedule(c, m)),
    myVote: d.myVotes[c.id] ?? 0,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${m.retailer} Pokémon Vending Machine`,
    address: { "@type": "PostalAddress", streetAddress: m.street, addressLocality: m.city, addressRegion: m.state, postalCode: m.zip, addressCountry: "US" },
    geo: { "@type": "GeoCoordinates", latitude: m.lat, longitude: m.lng },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="mb-4 text-sm text-muted">
        <Link href="/locations" className="hover:text-white">Locations</Link> ›{" "}
        <Link href={`/locations/${m.state.toLowerCase()}`} className="hover:text-white">{m.state}</Link> ›{" "}
        <Link href={`/locations/${m.state.toLowerCase()}/${m.citySlug}`} className="hover:text-white">{m.city}</Link>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="font-mono text-xs text-muted">{m.id}</span>
          <h1 className="text-3xl font-black text-white">{m.retailer}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-muted">
            <MapPin className="h-4 w-4" /> {m.street}, {m.city}, {m.state} {m.zip}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {m.status !== "active" && <span className="chip border-orange-400/40 text-orange-300">{m.status}</span>}
            <a
              className="chip hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${m.retailer}, ${m.street}, ${m.city}, ${m.state} ${m.zip}`)}`}
            >
              🧭 Directions ({m.street})
            </a>
            <span className="chip">Stock: {m.stockStatus}{m.stockUpdatedAt ? ` · ${timeAgo(m.stockUpdatedAt)}` : ""}</span>
            <AlertAdminButton machineId={m.id} label="Alert Admin (Wrong Time / Dead Machine)" />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <LiveDropStatus schedule={sched} accuracy={m.accuracy} verified={m.scheduleVerified} variant="big" />
          {sched && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">Current drop schedule</p>
                  <p className="text-lg font-bold text-white">{describeSchedule(sched)}</p>
                </div>
                <p className="text-xs text-muted">Times shown in {m.timezone.replace("_", " ")}</p>
              </div>
              <div className="mt-4">
                <AccuracyMeter accuracy={m.accuracy} verified={m.scheduleVerified} size="lg" />
                <p className="mt-2 text-xs text-muted">
                  {m.scheduleVerified
                    ? "Verified by a PackRadar moderator."
                    : (m.accuracy ?? 0) >= 90
                      ? "Confirmed by multiple collectors."
                      : "Not confirmed yet. Confirm or report drops to raise accuracy."}
                </p>
              </div>
            </div>
          )}

          <MachineActions
            machineId={m.id}
            signedIn={Boolean(user)}
            isFavorite={d.isFavorite}
            candidates={cands}
            schedule={sched}
            isStaff={isStaff(user)}
          />

          <MachineProductsCard
            machineId={m.id}
            initialProfileLabel={vendedProducts.profileLabel}
            initialItems={vendedProducts.items}
            signedIn={Boolean(user)}
          />

          <div className="card p-5">
            <p className="mb-3 font-bold text-white">Recent drop reports</p>
            {d.observations.length === 0 && <p className="text-sm text-muted">No reports yet.</p>}
            <ul className="divide-y divide-line text-sm">
              {d.observations.map(({ o, name }) => (
                <li key={o.id} className="flex items-center justify-between py-2">
                  <span>
                    {o.kind === "dropped" ? "🟢 Dropped" : "🚫 No drop"} at{" "}
                    <b className="text-white">
                      {o.observedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: m.timezone })}
                    </b>
                    {o.note && <span className="text-muted"> · {o.note}</span>}
                  </span>
                  <span className="text-xs text-muted">{name ?? "someone"} · {timeAgo(o.observedAt)}</span>
                </li>
              ))}
            </ul>
          </div>

          {d.history.length > 0 && (
            <div className="card p-5">
              <p className="mb-3 font-bold text-white">Schedule history</p>
              <ul className="space-y-2 text-sm">
                {d.history.map((h) => (
                  <li key={h.id} className="text-muted">
                    <span className="text-xs">{timeAgo(h.createdAt)}</span> · {h.fromDescription ? <>{h.fromDescription} → </> : null}
                    <b className="text-white">{h.toDescription}</b> <span className="text-xs">({h.reason})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-5">
            <p className="mb-3 font-bold text-white">Comments ({d.comments.length})</p>
            <CommentForm targetType="machine" targetId={m.id} signedIn={Boolean(user)} />
            <ul className="mt-5 space-y-4">
              {d.comments.map(({ c, name, image, reputation }) => (
                <li key={c.id} className="flex gap-3">
                  <Avatar name={name} image={image} />
                  <div>
                    <p className="text-sm">
                      <b className="text-white">{name}</b> <span className={`text-xs ${reputationBadge(reputation).color}`}>{reputationBadge(reputation).label}</span>{" "}
                      <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                      <CommentFlagButton commentId={c.id} signedIn={Boolean(user)} />
                    </p>
                    <p className="text-sm text-slate-300">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <DropMapClient machines={[toMapMachine(m)]} focusId={m.id} height="300px" showFilters={false} />
          <div className="card p-5">
            <p className="mb-1 font-bold text-white">Report machine status</p>
            <p className="mb-2.5 text-xs text-muted">
              Tapping <b className="text-white">📦 Stocked</b> after an <b className="text-white">🫙 Empty</b> check-in
              automatically narrows the drop minute window!
            </p>
            <StockButtons machineId={m.id} signedIn={Boolean(user)} />
          </div>
          {activeCorridor && (
            <div className="card space-y-3 border-purple-500/30 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-purple-300">
                  🛣️ Route Servicing Corridor
                </p>
                <span className="rounded-full bg-purple-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-purple-200">
                  ~{activeCorridor.fittedServiceMinutes}m / stop
                </span>
              </div>
              <p className="text-sm font-semibold text-white">{activeCorridor.name}</p>
              <ol className="space-y-1.5 text-xs">
                {activeCorridor.members.map((stop, idx) => (
                  <li
                    key={stop.id}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
                      stop.id === m.id ? "bg-purple-500/20 font-bold text-white ring-1 ring-purple-400/40" : "bg-panel-2 text-slate-300"
                    }`}
                  >
                    <Link href={`/machines/${stop.id}`} className="truncate hover:text-volt">
                      {idx + 1}. {stop.retailer} ({stop.city})
                    </Link>
                    <span className="ml-2 shrink-0 font-mono text-[11px] text-volt">
                      {stop.anchorMinute != null
                        ? `:${String(stop.anchorMinute).padStart(2, "0")}`
                        : "??"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <SponsorSlot lat={m.lat} lng={m.lng} placement="machine" />
          {d.nearby.length > 0 && (
            <div>
              <SectionTitle title="Nearby machines" />
              <div className="space-y-3">
                {d.nearby.map((n) => (
                  <MachineCard key={n.id} m={n} distance={n.distance} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

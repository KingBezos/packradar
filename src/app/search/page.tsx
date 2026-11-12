import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { MachineCard } from "@/components/MachineCard";
import { DropMapClient } from "@/components/DropMapClient";
import { InstantZipAlertBanner } from "@/components/InstantZipAlertBanner";
import { searchMachines, toMapMachine, TOP_15_METRO_CORRIDORS } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { SponsorSlot } from "@/components/SponsorSlot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search vending machines" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; zip?: string }>;
}) {
  const { q = "", zip = "" } = await searchParams;
  const query = (q || zip).trim();
  const [user, r] = await Promise.all([
    getCurrentUser(),
    query ? searchMachines(query) : searchMachines("97027"),
  ]);

  const signedIn = Boolean(user);
  const mm = r.machines.map((m, idx) => {
    const mapped = toMapMachine(m);
    if (!signedIn && idx >= 1) {
      return { ...mapped, a: null };
    }
    return mapped;
  });

  const activeQueryLabel = query || "97027";
  const unlockAllLabel = `Unlock all ${r.machines.length} timers near ${activeQueryLabel} — Free Account`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="w-full">
        <SearchBox initial={query} />
      </div>

      {/* Instant Pre-Warmed Top 15 Metro Corridors for <40ms Mobile Navigation */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-muted">
          ⚡ Instant Hot Corridors:
        </span>
        {TOP_15_METRO_CORRIDORS.slice(0, 10).map((c) => (
          <Link
            key={c.zip}
            href={`/search?q=${c.zip}`}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              query === c.zip || query.toLowerCase() === c.city.toLowerCase()
                ? "bg-volt font-bold text-slate-950"
                : "border border-line bg-panel-2 text-slate-300 hover:border-volt/50 hover:text-white"
            }`}
          >
            {c.city} ({c.zip})
          </Link>
        ))}
      </div>

      {query ? (
        <p className="mt-4 text-sm text-muted">
          {r.machines.length} machine{r.machines.length === 1 ? "" : "s"} for <b className="text-white">{query}</b>
          {r.center && ` · ${r.center.label}`}
          {!signedIn && r.machines.length > 1 && (
            <span className="ml-2 text-xs text-volt">
              · Showing #1 closest timer free ({r.machines.length - 1} more unlocked with free account)
            </span>
          )}
        </p>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Showing <b className="text-white">{r.machines.length} pre-warmed machines</b> · Enter any ZIP code, city, or
          tap a corridor above
        </p>
      )}

      {/* 1-Field Instant ZIP + Online Lottery Alert Capture (handles both >0 machines and 0-machine states!) */}
      <InstantZipAlertBanner
        query={activeQueryLabel}
        locationLabel={r.center?.label ?? (query || "Gladstone, OR")}
        lat={r.center?.lat ?? r.machines[0]?.lat ?? null}
        lng={r.center?.lng ?? r.machines[0]?.lng ?? null}
        machineCount={r.machines.length}
        signedIn={signedIn}
        userHandle={user?.name ?? null}
      />

      {r.machines.length > 0 && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="grid gap-3 sm:grid-cols-2">
            {r.machines.map((m, idx) => (
              <MachineCard
                key={m.id}
                m={m}
                distance={m.distance}
                freePreviewBadge={!signedIn && idx === 0}
                lockedTimer={!signedIn && idx >= 1}
                unlockLabel={unlockAllLabel}
              />
            ))}
          </div>
          <div className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
            <DropMapClient
              machines={mm}
              center={r.center ? [r.center.lng, r.center.lat] : undefined}
              zoom={10}
              height="420px"
              showFilters={false}
            />
            <SponsorSlot lat={r.center?.lat} lng={r.center?.lng} />
          </div>
        </div>
      )}
    </div>
  );
}

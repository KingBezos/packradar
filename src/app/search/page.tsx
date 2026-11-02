import type { Metadata } from "next";
import { SearchBox } from "@/components/SearchBox";
import { MachineCard } from "@/components/MachineCard";
import { EmptyState } from "@/components/ui";
import { DropMapClient } from "@/components/DropMapClient";
import { searchMachines, toMapMachine } from "@/lib/queries";
import { SponsorSlot } from "@/components/SponsorSlot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search vending machines" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const r = q ? await searchMachines(q) : { center: null, machines: [] };
  const mm = r.machines.map(toMapMachine);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="w-full">
        <SearchBox initial={q} />
      </div>
      {q && (
        <p className="mt-4 text-sm text-muted">
          {r.machines.length} machine{r.machines.length === 1 ? "" : "s"} for <b className="text-white">{q}</b>
          {r.center && ` · ${r.center.label}`}
        </p>
      )}
      {q && r.machines.length === 0 && (
        <div className="mt-6">
          <EmptyState title="No machines found">Try a ZIP code, a city, a store name, or a machine ID like Q01168.</EmptyState>
        </div>
      )}
      {r.machines.length > 0 && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="grid gap-3 sm:grid-cols-2">
            {r.machines.map((m) => (
              <MachineCard key={m.id} m={m} distance={m.distance} />
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

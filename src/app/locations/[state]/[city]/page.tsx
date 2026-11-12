import type { Metadata } from "next";
import Link from "next/link";
import { machinesInCity } from "@/lib/queries";
import { MachineCard } from "@/components/MachineCard";
import { InstantZipAlertBanner } from "@/components/InstantZipAlertBanner";
import { getCurrentUser } from "@/lib/session";
import { US_STATES } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const label = city.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: `Pokémon vending machines in ${label}, ${state.toUpperCase()} – drop times` };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}) {
  const { state, city } = await params;
  const [user, list] = await Promise.all([getCurrentUser(), machinesInCity(state, city)]);
  const signedIn = Boolean(user);
  const label = list[0]?.city ?? city;
  const locationLabel = `${label}, ${state.toUpperCase()}`;
  const unlockLabel = `Unlock all ${list.length} timers in ${label} — Free Account`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href={`/locations/${state}`} className="text-sm text-muted hover:text-white">
        ← {US_STATES[state.toUpperCase()] ?? state}
      </Link>
      <h1 className="mt-2 text-3xl font-black text-white">
        Pokémon vending machines in {locationLabel}
      </h1>

      <InstantZipAlertBanner
        query={list[0]?.zip ?? label}
        locationLabel={locationLabel}
        lat={list[0]?.lat ?? null}
        lng={list[0]?.lng ?? null}
        machineCount={list.length}
        signedIn={signedIn}
        userHandle={user?.name ?? null}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m, idx) => (
          <MachineCard
            key={m.id}
            m={m}
            freePreviewBadge={!signedIn && idx === 0}
            lockedTimer={!signedIn && idx >= 1}
            unlockLabel={unlockLabel}
          />
        ))}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { statesWithCounts } from "@/lib/queries";
import { US_STATES } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pokémon Vending Machines by State" };

export default async function LocationsPage() {
  const states = await statesWithCounts();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-black text-white">Machines by state</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {states.map((s) => (
          <Link key={s.state} href={`/locations/${s.state.toLowerCase()}`} className="card flex items-center justify-between p-4 hover:border-volt/40">
            <span className="font-semibold text-white">{US_STATES[s.state] ?? s.state}</span>
            <span className="chip">{s.n}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

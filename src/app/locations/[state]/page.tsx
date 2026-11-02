import type { Metadata } from "next";
import Link from "next/link";
import { citiesInState } from "@/lib/queries";
import { US_STATES } from "@/lib/geo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const { state } = await params;
  const name = US_STATES[state.toUpperCase()] ?? state.toUpperCase();
  return { title: `Pokémon vending machines in ${name}`, description: `Every Pokémon TCG vending machine in ${name} with live drop times.` };
}

export default async function StatePage({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const cities = await citiesInState(state);
  const name = US_STATES[state.toUpperCase()] ?? state.toUpperCase();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link href="/locations" className="text-sm text-muted hover:text-white">← All states</Link>
      <h1 className="mt-2 text-3xl font-black text-white">Pokémon vending machines in {name}</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {cities.map((c) => (
          <Link key={c.citySlug} href={`/locations/${state.toLowerCase()}/${c.citySlug}`} className="card flex items-center justify-between p-4 hover:border-volt/40">
            <span className="font-semibold text-white">{c.city}</span>
            <span className="chip">{c.n}</span>
          </Link>
        ))}
        {cities.length === 0 && <p className="text-muted">No machines found.</p>}
      </div>
    </div>
  );
}

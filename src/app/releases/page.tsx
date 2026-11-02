import type { Metadata } from "next";
import { getReleases } from "@/lib/queries";
import { ReleaseCountdown } from "@/components/ReleaseCountdown";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pokémon TCG Release Calendar" };

export default async function ReleasesPage() {
  const all = await getReleases();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = all.filter((r) => r.releaseDate && r.releaseDate >= today).sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!));
  const past = all.filter((r) => !r.releaseDate || r.releaseDate < today);
  const Row = ({ r }: { r: (typeof all)[number] }) => (
    <li className="card flex items-center gap-4 p-4">
      {r.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.imageUrl} alt="" className="h-14 w-28 object-contain" />
      ) : (
        <span className="flex h-14 w-28 items-center justify-center rounded-lg bg-panel-2 text-xs text-muted">TCG</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-bold text-white">{r.name}</p>
        <p className="text-sm text-muted">
          {r.releaseDate ?? "TBA"}{r.cardCount ? ` · ${r.cardCount} cards` : ""}
          {r.sourceUrl && <> · <a className="text-volt hover:underline" href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">details</a></>}
        </p>
      </div>
      {r.releaseDate && <ReleaseCountdown date={r.releaseDate} />}
    </li>
  );
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-black text-white">Release calendar</h1>
      <p className="mt-1 text-muted">New sets usually reach vending machines within days of launch. Turn on release alerts in <a className="text-volt" href="/alerts">My alerts</a>.</p>
      <h2 className="mb-3 mt-8 text-xl font-bold text-white">Upcoming</h2>
      <ul className="space-y-3">{upcoming.length ? upcoming.map((r) => <Row key={r.id} r={r} />) : <li className="text-sm text-muted">Nothing announced yet.</li>}</ul>
      <h2 className="mb-3 mt-10 text-xl font-bold text-white">Recent</h2>
      <ul className="space-y-3">{past.map((r) => <Row key={r.id} r={r} />)}</ul>
    </div>
  );
}

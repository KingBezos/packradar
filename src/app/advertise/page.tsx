import type { Metadata } from "next";

export const metadata: Metadata = { title: "Advertise on PackRadar" };

export default function Advertise() {
  return (
    <div className="prose-pr mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black text-white">Advertise on PackRadar</h1>
      <p>Own a local card shop or sell Pokémon products? Reach collectors in the exact area they&apos;re hunting machines. Sponsors are geo-targeted: your listing appears next to machines, search results and news for people within your chosen radius.</p>
      <ul>
        <li>Local shop spotlight (radius-targeted)</li>
        <li>Affiliate / partner offers</li>
        <li>Clicks and impressions reporting</li>
      </ul>
      <p>Contact the site operator to get started. Sponsors are managed from the admin panel.</p>
    </div>
  );
}

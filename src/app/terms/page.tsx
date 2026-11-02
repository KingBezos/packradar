import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms & disclaimer" };

export default function Terms() {
  return (
    <div className="prose-pr mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-black text-white">Terms &amp; disclaimer</h1>
      <p>PackRadar is an unofficial fan project. It is not affiliated with, endorsed or sponsored by Nintendo, Creatures, GAME FREAK, The Pokémon Company (International) or any retailer. Pokémon and related marks belong to their owners.</p>
      <h2>No guarantees</h2>
      <p>Drop times, stock and locations are community-sourced and automatically gathered estimates. They may be wrong. Don&apos;t drive anywhere you can&apos;t afford to be disappointed. Drive Plan routes are estimates; always obey traffic laws and don&apos;t use your phone while driving.</p>
      <h2>Conduct</h2>
      <p>Be respectful to store staff and other collectors. Don&apos;t submit false reports. Accounts that manipulate drop times may be removed.</p>
      <h2>Content</h2>
      <p>News items are short summaries that link to the original sources. If you are a rights holder and want something changed, contact us.</p>
      <p className="text-sm text-muted">This is a template. Have it reviewed by a lawyer before launching commercially.</p>
    </div>
  );
}

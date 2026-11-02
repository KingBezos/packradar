"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Radio, Trophy } from "lucide-react";

type Item = { id: string; message: string; url: string | null; createdAt?: string };

const FALLBACK_TICKER_ITEMS: Item[] = [
  {
    id: "init-1",
    message: "🎯 Confirmed drop window: Fred Meyer Gladstone, OR (Q00450) dropping at :18 past the hour (94% accuracy)",
    url: "/machines/Q00450",
  },
  {
    id: "init-2",
    message: "🔥 Prismatic Evolutions ETB & Booster Bundles monitored across Target, Best Buy, Walmart & Pokémon Center",
    url: "/drops",
  },
  {
    id: "init-3",
    message: "⚡ Confirmed drop: Safeway Seattle, WA (Q00003) verified on 60m cadence at :35 past the hour",
    url: "/machines/Q00003",
  },
  {
    id: "init-4",
    message: "🏆 Monthly Leaderboard Rewards: 1st Place wins Pokémon ETB · 2nd Booster Bundle · 3rd 2 Free Packs!",
    url: "/leaderboard",
  },
  {
    id: "init-5",
    message: "📍 Corridor Intelligence: Kroger Columbus, OH (Q00487) calibrated to :42 hourly drop window",
    url: "/machines/Q00487",
  },
  {
    id: "init-6",
    message: "🛒 Destined Rivals (Team Rocket) ETB & Booster Bundles tracked at Best Buy, Target, GameStop & Pokémon Center",
    url: "/drops",
  },
  {
    id: "init-7",
    message: "💊 Drugstore Check: CVS, Walgreens & Dollar General stocked with MJ Holdings 2-Pack Blisters & Knock Out Boxes",
    url: "/drops",
  },
  {
    id: "init-8",
    message: "⚡ High-Confidence Window: Vons Los Angeles, CA (Q00612) active on :24 hourly drop timer (93% accuracy)",
    url: "/machines/Q00612",
  },
];

/** Sitewide Monthly Prize Broadcast + Scrolling live activity ticker. */
export function LiveTicker() {
  const [items, setItems] = useState<Item[]>(FALLBACK_TICKER_ITEMS);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/activity?limit=25", { cache: "no-store" });
        if (r.ok && alive) {
          const data = (await r.json()) as Item[];
          if (Array.isArray(data) && data.length > 0) setItems(data);
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 25_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const loop = items.length ? [...items, ...items] : [];

  return (
    <div className="border-b border-line/80 bg-panel/60">
      {/* Sitewide Monthly Rep Prize Broadcast Bar */}
      <div className="border-b border-volt/20 bg-gradient-to-r from-yellow-500/15 via-amber-500/10 to-yellow-500/15">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
            <span className="inline-flex items-center gap-1 rounded-full bg-volt px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-950">
              <Trophy className="h-3 w-3" /> Monthly Rep Prizes
            </span>
            <span>
              Report drop times &amp; earn Rep to win:{" "}
              <b className="text-volt">🥇 1st: Pokémon ETB</b> ·{" "}
              <b className="text-amber-200">🥈 2nd: Booster Bundle</b> ·{" "}
              <b className="text-orange-200">🥉 3rd: 2 Free Packs</b>
            </span>
          </div>
          <Link
            href="/leaderboard"
            className="shrink-0 font-bold text-volt underline-offset-2 hover:underline"
          >
            View Leaderboard &amp; Standings →
          </Link>
        </div>
      </div>

      {loop.length > 0 && (
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4">
          <span className="flex shrink-0 items-center gap-1.5 py-2 text-[11px] font-bold uppercase tracking-widest text-green-400">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> Live
          </span>
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_4%,black_96%,transparent)]">
            <div className="animate-ticker flex w-max items-center gap-10 py-2">
              {loop.map((it, i) => (
                <Link
                  key={`${it.id}-${i}`}
                  href={it.url ?? "#"}
                  className="inline-flex items-center gap-3 whitespace-nowrap text-xs text-slate-300 hover:text-white"
                >
                  <span>{it.message}</span>
                  <span className="text-slate-600" aria-hidden>
                    •
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

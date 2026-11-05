import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Gift, Sparkles, Camera, ShieldAlert } from "lucide-react";
import { leaderboard } from "@/lib/queries";
import { Avatar, reputationBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Spotter Leaderboard & Monthly Pokémon TCG Prizes",
  description:
    "Top monthly PackRadar spotters win sealed Pokémon TCG prizes: 1st Place Elite Trainer Box (ETB), 2nd Place Booster Bundle, 3rd Place 2 Free Booster Packs.",
};

const PRIZE_BADGES = [
  { rank: 1, medal: "🥇", label: "Wins Pokémon ETB", cls: "border-volt/50 bg-volt/15 text-volt" },
  { rank: 2, medal: "🥈", label: "Wins Booster Bundle", cls: "border-amber-300/40 bg-amber-400/10 text-amber-200" },
  { rank: 3, medal: "🥉", label: "Wins 2 Free Packs", cls: "border-orange-400/40 bg-orange-500/10 text-orange-200" },
];

export default async function LeaderboardPage() {
  const [month, all] = await Promise.all([
    leaderboard(30, 20),
    leaderboard(undefined, 25),
  ]);
  const monthName = new Date().toLocaleString("en-US", { month: "long" });

  const List = ({
    rows,
    title,
    showPrizes,
  }: {
    rows: { id: string; name: string; image: string | null; reputation: number }[];
    title: string;
    showPrizes?: boolean;
  }) => (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {showPrizes && (
          <span className="rounded-full bg-volt/15 px-2.5 py-0.5 text-[11px] font-bold text-volt">
            🎁 Prize Qualifying Board
          </span>
        )}
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted">No activity yet. Report a drop to take #1 and claim the ETB!</p>
      )}
      <ol className="divide-y divide-line">
        {rows.map((r, i) => {
          const b = reputationBadge(r.reputation);
          const prize = showPrizes && i < 3 ? PRIZE_BADGES[i] : null;
          return (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <span className="w-6 text-center font-mono text-sm text-muted">
                {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
              </span>
              <Avatar name={r.name} image={r.image} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-white">{r.name}</p>
                  {prize && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${prize.cls}`}>
                      🎁 {prize.label}
                    </span>
                  )}
                </div>
                <p className={`text-xs ${b.color}`}>{b.label}</p>
              </div>
              <span className="font-mono font-bold text-volt">{r.reputation} rep</span>
            </li>
          );
        })}
      </ol>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      {/* Monthly Prize Hero Banner */}
      <div className="card relative overflow-hidden border-volt/40 bg-gradient-to-br from-yellow-500/15 via-panel to-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
              <Trophy className="h-3.5 w-3.5" /> {monthName} Spotter Championship
            </span>
            <h1 className="text-3xl font-black text-white sm:text-4xl">
              Hunt Drops. Help the Community. <span className="text-volt">Win Sealed Pokémon Product.</span>
            </h1>
            <p className="text-sm leading-relaxed text-slate-300">
              At the end of every month, the top 3 Reputation earners on PackRadar receive free sealed Pokémon TCG
              prizes shipped directly to their door.
            </p>
          </div>
          <Link href="/map" className="btn-primary">
            <Sparkles className="h-4 w-4" /> Find a Machine &amp; Earn Rep
          </Link>
        </div>

        {/* 3 Prize Podium Cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-volt/50 bg-volt/10 p-5">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🥇</span>
              <span className="rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-black uppercase text-slate-950">
                1st Place Monthly
              </span>
            </div>
            <p className="mt-3 text-xl font-black text-white">Pokémon Elite Trainer Box (ETB)</p>
            <p className="mt-1 text-xs text-slate-300">
              Awarded to the #1 spotter with the most Reputation earned during {monthName}.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-5">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🥈</span>
              <span className="rounded-full bg-amber-300/20 px-2.5 py-0.5 text-[11px] font-bold uppercase text-amber-200">
                2nd Place Monthly
              </span>
            </div>
            <p className="mt-3 text-xl font-black text-white">Pokémon Booster Bundle</p>
            <p className="mt-1 text-xs text-slate-300">
              6-pack sealed Pokémon TCG Booster Bundle shipped to the #2 monthly spotter.
            </p>
          </div>

          <div className="rounded-2xl border border-orange-400/40 bg-orange-500/10 p-5">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🥉</span>
              <span className="rounded-full bg-orange-400/20 px-2.5 py-0.5 text-[11px] font-bold uppercase text-orange-200">
                3rd Place Monthly
              </span>
            </div>
            <p className="mt-3 text-xl font-black text-white">2 Free Booster Packs</p>
            <p className="mt-1 text-xs text-slate-300">
              Two sealed Pokémon TCG sleeved booster packs for the #3 monthly spotter.
            </p>
          </div>
        </div>

        {/* How to earn points strip */}
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-slate-950/60 p-3 text-xs text-slate-300">
          <span className="flex items-center gap-1 font-bold text-white">
            <Gift className="h-3.5 w-3.5 text-volt" /> How to earn Rep:
          </span>
          <span className="chip border-volt/40 text-volt">
            <Camera className="h-3 w-3" /> Snap Receipt / Screen Photo: +25 Rep
          </span>
          <span className="chip text-white">First Finder: +10 Rep</span>
          <span className="chip border-green-500/40 text-green-300">Corroborated Truth Bonus: +3 Rep</span>
          <span className="chip text-white">Add machine: +5 Rep</span>
          <span className="chip text-white">Report live drop: +2 Rep</span>
          <span className="chip text-white">Vote / stock check: +1 Rep</span>
        </div>

        {/* Anti-Spam & Fair-Play Notice */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/25 p-3 text-xs text-slate-300">
          <span className="flex items-center gap-1 font-bold text-red-300">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" /> Fair-Play &amp; Anti-Spam Policy:
          </span>
          <span>
            Automated anti-spam, bot-detection, and false-report verification policies are strictly enforced—accounts
            found gaming reputation or submitting fake reports will have points deducted or be disqualified from
            monthly prizes.
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <List rows={month} title={`This Month (${monthName} Prize Standings)`} showPrizes />
        <List rows={all} title="All-Time Legends" />
      </div>
    </div>
  );
}

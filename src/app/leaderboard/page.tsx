import type { Metadata } from "next";
import Link from "next/link";
import { Trophy, Gift, Sparkles, Camera, ShieldAlert, Clock, Award, Crown } from "lucide-react";
import { getLeaderboardOverview, type LeaderboardEntry } from "@/lib/queries";
import { Avatar, EARNABLE_RANKS, reputationBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Spotter Leaderboard, Daily Ranks & Monthly Pokémon TCG Prizes",
  description:
    "Earn daily Spotter Ranks (Rookie to Legend) that reset every midnight PT, and compete for monthly sealed Pokémon TCG prizes: 1st Place Elite Trainer Box (ETB), 2nd Place Booster Bundle, 3rd Place 2 Free Booster Packs.",
};

const PRIZE_BADGES = [
  { rank: 1, medal: "🥇", label: "Wins Pokémon ETB", cls: "border-volt/50 bg-volt/15 text-volt" },
  { rank: 2, medal: "🥈", label: "Wins Booster Bundle", cls: "border-amber-300/40 bg-amber-400/10 text-amber-200" },
  { rank: 3, medal: "🥉", label: "Wins 2 Free Packs", cls: "border-orange-400/40 bg-orange-500/10 text-orange-200" },
];

export default async function LeaderboardPage() {
  const { todayLabel, currentMonthName, lastMonthName, daily, month, allTime, lastMonthTop3 } =
    await getLeaderboardOverview();

  const List = ({
    rows,
    title,
    subtitle,
    badgeText,
    showPrizes,
    scoreSuffix = "rep",
  }: {
    rows: LeaderboardEntry[];
    title: string;
    subtitle?: string;
    badgeText?: string;
    showPrizes?: boolean;
    scoreSuffix?: string;
  }) => (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        {badgeText && (
          <span className="rounded-full bg-volt/15 px-2.5 py-0.5 text-[11px] font-bold text-volt">
            {badgeText}
          </span>
        )}
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted">
          No activity yet today. Report a live drop (+2 Rep) or stock check (+1 Rep) to claim #1!
        </p>
      )}
      <ol className="divide-y divide-line">
        {rows.map((r, i) => {
          // Daily rank is earned from today's dailyRep and resets every day at 12:00 AM PT
          const b = reputationBadge(r.dailyRep);
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
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${b.badgeCls}`}
                    title="Daily Spotter Rank (Resets daily at 12:00 AM PT)"
                  >
                    <span>{b.icon}</span>
                    <span>{b.label}</span>
                  </span>
                  {prize && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${prize.cls}`}>
                      🎁 {prize.label}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  Today: <span className="font-mono text-slate-300">+{r.dailyRep} rep</span> · {currentMonthName}:{" "}
                  <span className="font-mono text-slate-300">{r.monthRep} rep</span>
                </p>
              </div>
              <span className="font-mono font-bold text-volt">
                {r.reputation} {scoreSuffix}
              </span>
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
              <Trophy className="h-3.5 w-3.5" /> {currentMonthName} Spotter Championship
            </span>
            <h1 className="text-3xl font-black text-white sm:text-4xl">
              Hunt Drops. Help the Community. <span className="text-volt">Win Sealed Pokémon Product.</span>
            </h1>
            <p className="text-sm leading-relaxed text-slate-300">
              At the end of every month, the top 3 Reputation earners on PackRadar receive free sealed Pokémon TCG
              prizes shipped directly to their door. Spotter Ranks reset daily at midnight PT while every point you earn
              accumulates toward the monthly prize board!
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
              Awarded to the #1 spotter with the most Reputation earned during {currentMonthName}.
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

      {/* ═══════════════════════════════════════════════════════════════════════
          EARNABLE DAILY SPOTTER RANKS (RESETS DAILY AT 12:00 AM PT)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="card border-sky-500/30 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-white">
              <Award className="h-5 w-5 text-volt" /> Spotter Ranks You Can Earn Today
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Climb from <b className="text-white">🌱 Rookie</b> to <b className="text-volt">👑 Legend</b> each day by
              reporting live drops and machine stock. Daily Ranks reset every night at{" "}
              <b className="text-sky-300">12:00 AM PT</b>, while all Rep earned stays on your Monthly Prize &amp;
              All-Time totals.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-200">
            <Clock className="h-3.5 w-3.5" /> Resets Daily at 12:00 AM PT ({todayLabel})
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {EARNABLE_RANKS.map((tier) => (
            <div
              key={tier.label}
              className="flex flex-col justify-between rounded-2xl border border-line bg-panel-2/70 p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${tier.badgeCls}`}>
                    <span>{tier.icon}</span>
                    <span>{tier.label}</span>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-volt">{tier.rangeLabel}</span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{tier.perk}</p>
              </div>
              <div className="mt-3 border-t border-line/60 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Tier {tier.rank} of 5 · Daily Reset
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LAST MONTH'S TOP 3 PRIZE WINNERS (HALL OF FAME)
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="card border-amber-400/35 bg-gradient-to-r from-amber-500/10 via-panel to-panel p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-white">
              <Crown className="h-5 w-5 text-volt" /> Last Month&apos;s Top 3 Winners ({lastMonthName})
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Locked in at the end of {lastMonthName}. Every new month resets the Monthly Prize Standings below while
              preserving last month&apos;s Top 3 champions here.
            </p>
          </div>
          <span className="rounded-full border border-volt/40 bg-volt/15 px-3 py-1 text-xs font-bold text-volt">
            🏆 {lastMonthName} Podium
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {lastMonthTop3.map((winner, idx) => {
            const medal = ["🥇 1st Place", "🥈 2nd Place", "🥉 3rd Place"][idx] ?? `#${idx + 1}`;
            const borderCls =
              idx === 0
                ? "border-volt/50 bg-volt/10"
                : idx === 1
                  ? "border-amber-300/40 bg-amber-400/10"
                  : "border-orange-400/40 bg-orange-500/10";
            return (
              <div key={winner.id} className={`rounded-2xl border p-4 ${borderCls}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-white">{medal}</span>
                  <span className="font-mono text-xs font-extrabold text-volt">{winner.reputation} rep</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar name={winner.name} image={winner.image} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-base font-black text-white">{winner.name}</p>
                    <p className="truncate text-xs font-semibold text-volt">🎁 {winner.prizeLabel}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LIVE STANDINGS BOARDS: TODAY (DAILY RESET) · THIS MONTH · ALL-TIME
         ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid gap-6 lg:grid-cols-3">
        <List
          rows={daily}
          title={`Today's Spotters (${todayLabel})`}
          subtitle="Ranks & daily points reset every night at 12:00 AM PT"
          badgeText="⚡ Resets Daily"
          scoreSuffix="today"
        />
        <List
          rows={month}
          title={`This Month (${currentMonthName} Prizes)`}
          subtitle={`Top 3 on the last day of ${currentMonthName} win sealed prizes`}
          badgeText="🎁 Prize Board"
          showPrizes
        />
        <List
          rows={allTime}
          title="All-Time Legends"
          subtitle="Cumulative lifetime Reputation across PackRadar"
          badgeText="👑 Lifetime"
        />
      </div>
    </div>
  );
}

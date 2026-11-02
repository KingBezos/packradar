import Link from "next/link";
import { CalendarDays, Newspaper, Radar, ShieldCheck, Users, Bell, Trophy } from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import { DropMapClient } from "@/components/DropMapClient";
import { DroppingSoon } from "@/components/DroppingSoon";
import { SponsorSlot } from "@/components/SponsorSlot";
import { NewsCard } from "@/components/NewsCard";
import { SectionTitle } from "@/components/ui";
import { latestNews, siteStats, upcomingReleases } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { ReleaseCountdown } from "@/components/ReleaseCountdown";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, news, releases, user] = await Promise.all([siteStats(), latestNews(6), upcomingReleases(4), getCurrentUser()]);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:pt-16">
          <div className="max-w-3xl">
            <span className="chip border-volt/30 text-volt">
              <Radar className="h-3.5 w-3.5" /> {stats.total.toLocaleString()} machines · {stats.states} states · live
            </span>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight text-white sm:text-6xl">
              Know <span className="text-volt">exactly when</span> the Pokémon vending machine near you drops.
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-300">
              Live drop timers for every Pokémon TCG vending machine in the US, crowd-confirmed by collectors. Pins go{" "}
              <span className="font-semibold text-yellow-300">yellow</span> 10 minutes before a drop and{" "}
              <span className="font-semibold text-green-400">green</span> the moment it happens.
            </p>
            <div className="mt-6 max-w-2xl">
              <SearchBox />
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
              <span>
                <b className="text-white">{stats.withTimes.toLocaleString()}</b> with drop times
              </span>
              <span>
                <b className="text-green-400">{stats.confirmed.toLocaleString()}</b> confirmed ≥90%
              </span>
              <span>
                <b className="text-white">{stats.reports24h.toLocaleString()}</b> community reports today
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Live map + next drops */}
      <section className="mx-auto max-w-7xl px-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DropMapClient height="520px" />
            <div className="mt-2 text-right">
              <Link href="/map" className="text-sm font-semibold text-volt hover:underline">
                Open full-screen map →
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <DroppingSoon />
            <SponsorSlot placement="sidebar" />
          </div>
        </div>
      </section>

      {/* Monthly Rep Leaderboard Giveaway */}
      <section className="mx-auto mt-12 max-w-7xl px-4">
        <div className="card relative overflow-hidden border-volt/40 bg-gradient-to-r from-yellow-500/15 via-panel to-amber-500/10 p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-volt px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                <Trophy className="h-3.5 w-3.5" /> Monthly Spotter Rewards
              </span>
              <h2 className="text-2xl font-black text-white sm:text-3xl">
                Report Drops &amp; Win Free Sealed Pokémon TCG Every Month
              </h2>
              <p className="text-sm text-slate-300">
                Every drop report (+2 Rep), first-finder discovery (+10 Rep), and receipt/screen photo proof (+25 Rep)
                climbs the monthly leaderboard. Top 3 spotters each month win:
              </p>
            </div>
            <Link href="/leaderboard" className="btn-primary shrink-0">
              <Trophy className="h-4 w-4" /> View Monthly Standings
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-volt/50 bg-slate-950/60 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-volt">🥇 1st Place Monthly</span>
              <p className="mt-1 text-lg font-black text-white">Pokémon Elite Trainer Box (ETB)</p>
            </div>
            <div className="rounded-xl border border-amber-300/40 bg-slate-950/60 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-200">🥈 2nd Place Monthly</span>
              <p className="mt-1 text-lg font-black text-white">Pokémon Booster Bundle</p>
            </div>
            <div className="rounded-xl border border-orange-400/40 bg-slate-950/60 p-4">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-200">🥉 3rd Place Monthly</span>
              <p className="mt-1 text-lg font-black text-white">2 Free Booster Packs</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-16 max-w-7xl px-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <Radar className="h-6 w-6" />,
              title: "We scour the web daily",
              body: "Every morning PackRadar refreshes every machine location and mines Reddit and community posts for drop times like “drops at :37”.",
            },
            {
              icon: <Users className="h-6 w-6" />,
              title: "Collectors confirm it",
              body: "Saw a drop? Tap “It dropped!”. Each confirmation pushes the accuracy meter toward 100%. If most people report a different time, we switch to it automatically.",
            },
            {
              icon: <Bell className="h-6 w-6" />,
              title: "Get pinged before it drops",
              body: "Favorite your machines and get an email, push or Discord alert minutes before the timer hits.",
            },
          ].map((c) => (
            <div key={c.title} className="card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-volt/10 text-volt">{c.icon}</span>
              <h3 className="mt-4 text-lg font-bold text-white">{c.title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* News + releases */}
      <section className="mx-auto mt-16 grid max-w-7xl gap-8 px-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle title="Latest Pokémon news" href="/news" icon={<Newspaper className="h-5 w-5 text-volt" />} />
          <div className="grid gap-4 sm:grid-cols-2">
            {news.map((n) => (
              <NewsCard key={n.id} post={n} />
            ))}
          </div>
        </div>
        <div>
          <SectionTitle title="Coming soon" href="/releases" cta="Calendar" icon={<CalendarDays className="h-5 w-5 text-volt" />} />
          <div className="flex flex-col gap-3">
            {releases.length === 0 && <p className="text-sm text-muted">No upcoming releases loaded yet.</p>}
            {releases.map((r) => (
              <div key={r.id} className="card flex items-center gap-4 p-4">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" className="h-10 w-20 object-contain" />
                ) : (
                  <span className="flex h-10 w-20 items-center justify-center rounded-lg bg-panel-2 text-xs text-muted">TCG</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-white">{r.name}</p>
                  <p className="text-xs text-muted">
                    {r.releaseDate}
                    {r.cardCount ? ` · ${r.cardCount} cards` : ""}
                  </p>
                </div>
                {r.releaseDate && <ReleaseCountdown date={r.releaseDate} />}
              </div>
            ))}
          </div>
          {!user && (
            <div className="card mt-6 border-volt/30 bg-gradient-to-br from-volt/10 to-transparent p-6">
              <ShieldCheck className="h-7 w-7 text-volt" />
              <h3 className="mt-3 text-lg font-bold text-white">Become a PackRadar spotter</h3>
              <p className="mt-1 text-sm text-muted">Free account: report drops, earn reputation and badges, and get alerts before your machines drop.</p>
              <Link href="/sign-up" className="btn-primary mt-4">
                Create free account
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

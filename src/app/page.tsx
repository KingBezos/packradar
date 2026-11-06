import Link from "next/link";
import { CalendarDays, Newspaper, Radar, ShieldCheck, Users, Bell, Trophy, Flame } from "lucide-react";
import { SearchBox } from "@/components/SearchBox";
import { DropMapClient } from "@/components/DropMapClient";
import { DroppingSoon } from "@/components/DroppingSoon";
import { SponsorSlot } from "@/components/SponsorSlot";
import { NewsCard } from "@/components/NewsCard";
import { ShareButtons } from "@/components/ShareButtons";
import { TopicAlertButton } from "@/components/TopicAlertButton";
import { SectionTitle } from "@/components/ui";
import { getMapMachines, getRetailDropIntel, latestNews, siteStats, upcomingReleases } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { ReleaseCountdown } from "@/components/ReleaseCountdown";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [stats, news, releases, user, mapMachines, retailIntel] = await Promise.all([
    siteStats(),
    latestNews(6),
    upcomingReleases(4),
    getCurrentUser(),
    getMapMachines(),
    getRetailDropIntel(),
  ]);

  return (
    <div>
      {/* Compact Full-Width Hero + Full-Length Search Bar */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 pb-5 pt-6 sm:pt-8">
          <div className="card border-line/80 bg-gradient-to-r from-panel via-panel-2/90 to-panel p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip border-volt/30 text-volt">
                    <Radar className="h-3.5 w-3.5" /> {stats.total.toLocaleString()} machines · {stats.states} states · live
                  </span>
                  <span className="text-xs text-muted">
                    Pins go <b className="text-yellow-300">yellow</b> 10m before drop &amp; <b className="text-green-400">green</b> on drop
                  </span>
                </div>
                <h1 className="text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                  Know <span className="text-volt">exactly when</span> the Pokémon vending machine near you drops.
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <div className="rounded-xl border border-line bg-bg/70 px-3 py-2">
                  <span className="font-black text-white">{stats.withTimes.toLocaleString()}</span>{" "}
                  <span className="text-muted">with drop times</span>
                </div>
                <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <span className="font-black text-green-400">{stats.confirmed.toLocaleString()}</span>{" "}
                  <span className="text-green-200/80">confirmed ≥90%</span>
                </div>
                <div className="rounded-xl border border-line bg-bg/70 px-3 py-2">
                  <span className="font-black text-volt">{stats.reports24h.toLocaleString()}</span>{" "}
                  <span className="text-muted">reports today</span>
                </div>
              </div>
            </div>

            <div className="mt-4 w-full">
              <SearchBox />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-slate-400">Popular searches:</span>
                {[
                  { label: "Seattle, WA", q: "Seattle" },
                  { label: "Gladstone, OR", q: "97027" },
                  { label: "Los Angeles, CA", q: "Los Angeles" },
                  { label: "Denver, CO", q: "Denver" },
                  { label: "Columbus, OH", q: "Columbus" },
                  { label: "Phoenix, AZ", q: "Phoenix" },
                ].map((item) => (
                  <Link
                    key={item.q}
                    href={`/search?q=${encodeURIComponent(item.q)}`}
                    className="rounded-full border border-line bg-bg/60 px-2.5 py-0.5 text-slate-300 transition hover:border-volt/50 hover:text-volt"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <Link href="/drops" className="font-semibold text-volt hover:underline">
                View Retail Drops (Target, Best Buy, Walmart, CVS) →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Live map + next drops */}
      <section className="mx-auto max-w-7xl px-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DropMapClient machines={mapMachines} height="520px" />
            <div className="mt-2 text-right">
              <Link href="/map" className="text-sm font-semibold text-volt hover:underline">
                Open full-screen map →
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <DroppingSoon initialMachines={mapMachines} />
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

      {/* Breaking Retail & Warehouse Drop Radar */}
      <section className="mx-auto mt-12 max-w-7xl px-4">
        <div className="card border-volt/35 bg-gradient-to-br from-emerald-500/10 via-panel to-panel p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-volt/15 px-3 py-1 text-xs font-black uppercase tracking-wider text-volt">
                <Flame className="h-3.5 w-3.5" /> Breaking Retail &amp; Warehouse Drop Radar (Scanned Every 2h)
              </span>
              <h2 className="mt-2 text-2xl font-black text-white">
                Upcoming Big-Box &amp; Warehouse Drops (Sam&apos;s Club, Costco, Target &amp; Pokémon Center)
              </h2>
            </div>
            <Link href="/drops" className="btn-ghost text-xs font-bold text-volt">
              View All Retail Drops →
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {retailIntel.items.slice(0, 3).map((item, idx) => {
              const sharePath = item.url.startsWith("/") ? item.url : "/drops";
              return (
                <div
                  key={item.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 ${
                    idx === 0
                      ? "border-volt/50 bg-volt/10"
                      : "border-line bg-panel-2/80"
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="rounded-full bg-volt px-2.5 py-0.5 font-black uppercase text-slate-950">
                        {item.retailer === "samsclub" ? "Sam's Club" : item.retailer.replace("_", " ")}
                      </span>
                      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-green-400">
                        {idx === 0 ? "🚨 Breaking Alert" : "High Signal"}
                      </span>
                    </div>
                    <Link
                      href={sharePath}
                      className="mt-2.5 block text-base font-black leading-snug text-white hover:text-volt"
                    >
                      {item.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate-300">{item.productName}</p>
                    <p className="mt-2 text-xs font-semibold text-amber-200">
                      ⏰ {item.expectedWindow}
                    </p>
                  </div>
                  <div className="mt-3 space-y-2 border-t border-line/60 pt-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted">Instant SKU &amp; Restock Alert</span>
                      <TopicAlertButton
                        topicKeyword={item.title}
                        path={sharePath}
                        kind="product_restock"
                        retailer={item.retailer}
                        compact
                        buttonLabel="Get Alerts"
                      />
                    </div>
                    <ShareButtons
                      path={sharePath}
                      title={item.title}
                      summary={`${item.productName} · ${item.expectedWindow}`}
                      compact
                    />
                  </div>
                </div>
              );
            })}
          </div>
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

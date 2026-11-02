import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Bell, ExternalLink, Store, Clock, Radar, Flame } from "lucide-react";
import { getProductsWithListings, getRetailDropIntel } from "@/lib/queries";
import { RetailScanBar } from "@/components/RetailScanBar";
import { timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Retail Drops & Restock Tracker – Target, Walmart, Best Buy, CVS, Walgreens, Dollar General",
  description:
    "Verified MSRP Pokémon TCG retail restock tracker (scanned continuously throughout the day) across Pokémon Center, Target, Walmart, Best Buy, GameStop, Costco, CVS, Walgreens, Dollar General, and Barnes & Noble.",
};

const IN_STORE_RETAILERS = new Set(["cvs", "walgreens", "dollargeneral", "barnesandnoble", "costco"]);

const RETAILER_META: Record<string, { label: string; badgeCls: string; scheduleHint: string }> = {
  pokemon_center: {
    label: "Pokémon Center",
    badgeCls: "border-red-500/40 bg-red-500/10 text-red-200",
    scheduleHint: "Queue drops Tue–Thu 9:00 AM–11:00 AM PT",
  },
  target: {
    label: "Target",
    badgeCls: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    scheduleHint: "Online restocks Thu/Fri 6:00–8:00 AM CT · In-store Excell vendor Tue–Fri",
  },
  walmart: {
    label: "Walmart",
    badgeCls: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    scheduleHint: "Online drops Wed/Thu 12:00 PM ET · In-store MJ Holding restocks Thu/Fri",
  },
  bestbuy: {
    label: "Best Buy",
    badgeCls: "border-yellow-400/40 bg-yellow-400/10 text-yellow-200",
    scheduleHint: "Online drops Tue/Thu mornings · Store pickup allocations Fri",
  },
  gamestop: {
    label: "GameStop",
    badgeCls: "border-slate-400/40 bg-slate-400/10 text-slate-200",
    scheduleHint: "Pre-order & release day allocations Fri 10:00 AM local",
  },
  costco: {
    label: "Costco",
    badgeCls: "border-blue-400/40 bg-blue-400/10 text-blue-200",
    scheduleHint: "Pallet drops (Blooming Waters / 151 Tins) 9:30 AM warehouse open",
  },
  cvs: {
    label: "CVS Pharmacy",
    badgeCls: "border-red-400/40 bg-red-400/10 text-red-200",
    scheduleHint: "Behind-counter blisters & tins restocked on weekly tote truck days",
  },
  walgreens: {
    label: "Walgreens",
    badgeCls: "border-orange-400/40 bg-orange-400/10 text-orange-200",
    scheduleHint: "Mystery packs, tins & 2-pack blisters restocked Tue/Thu truck deliveries",
  },
  dollargeneral: {
    label: "Dollar General",
    badgeCls: "border-volt/50 bg-volt/15 text-volt",
    scheduleHint: "Knock Out collections, tins & $5.50 blisters ($5 off $25 Sat)",
  },
  barnesandnoble: {
    label: "Barnes & Noble",
    badgeCls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    scheduleHint: "Behind customer service counter · 2-item limit per collector",
  },
  amazon: {
    label: "Amazon (Sold by Amazon MSRP Only)",
    badgeCls: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    scheduleHint: "Invite-only & MSRP lightning restocks (3rd-party scalpers filtered out)",
  },
};

export default async function DropsPage() {
  const [products, intel] = await Promise.all([getProductsWithListings(), getRetailDropIntel()]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span className="chip border-volt/30 text-volt">
            <ShoppingCart className="h-3.5 w-3.5" /> Strict MSRP Stock Verifier · Continuous Live Scanning
          </span>
          <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">
            Pokémon TCG Retail Drops &amp; Upcoming Restocks
          </h1>
          <p className="mt-1 text-sm text-muted">
            We scan <b className="text-slate-200">continuously throughout the day</b> for real MSRP stock across Pokémon
            Center, Target, Walmart, Best Buy, GameStop, Amazon, Costco, CVS, Walgreens &amp; Dollar General — filtering
            out 3rd-party scalpers and tracking upcoming restock windows.
          </p>
        </div>
        <Link href="/alerts" className="btn-primary">
          <Bell className="h-4 w-4" /> Set Restock Alerts
        </Link>
      </div>

      {/* Live Scan Bar */}
      <RetailScanBar lastScanAt={intel.lastScanAt} nextScanAt={intel.nextScanAt} />

      {/* Upcoming Drops & Restock Signals */}
      <div className="card border-volt/25 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-volt" />
            <h2 className="text-sm font-black uppercase tracking-wider text-white">
              📡 Potential Upcoming Drops &amp; Restock Radar
            </h2>
          </div>
          <span className="text-xs text-muted">Monitored continuously throughout the day</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {intel.items.map((item) => {
            const rMeta = RETAILER_META[item.retailer] ?? {
              label: item.retailer,
              badgeCls: "border-line bg-panel-2 text-slate-200",
            };
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col justify-between rounded-xl border border-line bg-panel-2/80 p-3.5 transition hover:border-volt/40"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 font-bold ${rMeta.badgeCls}`}>
                        {rMeta.label}
                      </span>
                      <span className="rounded-full bg-bg px-2 py-0.5 font-medium text-slate-300">
                        {item.sourceLabel}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        item.confidence === "high"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {item.confidence === "high" ? "High Signal" : "Community Watch"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-white group-hover:text-volt">{item.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{item.productName}</p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-200">
                    <Flame className="h-3.5 w-3.5 text-volt" /> {item.expectedWindow}
                  </span>
                  <span className="text-[11px] text-muted">{timeAgo(new Date(item.spottedAt))}</span>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Product Grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {products.map((p) => {
          const inStockCount = p.listings.filter((l) => l.inStock).length;
          return (
            <div key={p.id} className="card flex flex-col justify-between p-5">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-volt">{p.setName}</span>
                    <h3 className="text-lg font-bold text-white">{p.name}</h3>
                  </div>
                  <div className="text-right">
                    {p.msrp && (
                      <span className="rounded-lg border border-line bg-panel-2 px-2 py-1 font-mono text-xs font-bold text-slate-200">
                        MSRP ${p.msrp.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold ${
                      inStockCount > 0
                        ? "border border-green-500/40 bg-green-500/15 text-green-400"
                        : "border border-line bg-panel-2 text-slate-300"
                    }`}
                  >
                    {inStockCount > 0
                      ? `🟢 Verified In Stock at ${inStockCount} retailer${inStockCount > 1 ? "s" : ""} (MSRP)`
                      : "🔴 Sold Out Online at MSRP · Continuously Monitored"}
                  </span>
                </div>

                <ul className="mt-4 divide-y divide-line/70">
                  {p.listings.map((l) => {
                    const meta = RETAILER_META[l.retailer] ?? {
                      label: l.retailer,
                      badgeCls: "border-line bg-panel-2 text-slate-200",
                      scheduleHint: "",
                    };
                    const isInStoreOnly = !l.inStock && IN_STORE_RETAILERS.has(l.retailer);
                    return (
                      <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                        <a
                          href={l.affiliateUrl ?? l.url}
                          target="_blank"
                          rel="sponsored noopener noreferrer"
                          className="group flex items-center gap-2 font-medium text-slate-200 hover:text-volt"
                        >
                          <Store className="h-3.5 w-3.5 text-muted group-hover:text-volt" />
                          <span>{meta.label}</span>
                          <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                        </a>
                        <div className="flex items-center gap-2.5">
                          {l.price != null && (
                            <span className="font-mono text-xs text-slate-400">MSRP ${l.price.toFixed(2)}</span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              l.inStock
                                ? "border border-green-500/40 bg-green-500/15 text-green-400"
                                : isInStoreOnly
                                  ? "border border-amber-400/30 bg-amber-500/10 text-amber-200"
                                  : "bg-panel-2 text-muted"
                            }`}
                          >
                            {l.inStock
                              ? "IN STOCK (MSRP)"
                              : isInStoreOnly
                                ? "In-Store Check Only"
                                : "Sold Out (MSRP)"}
                          </span>
                          {l.lastCheckedAt && (
                            <span className="hidden text-[10px] text-muted sm:inline">
                              {timeAgo(l.lastCheckedAt)}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Major Retailer Restock Cadence Cheat Sheet */}
      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-volt" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">
            Major Retailer Restock Windows &amp; Vendor Schedules
          </h2>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(RETAILER_META)
            .slice(0, 9)
            .map(([key, r]) => (
              <div key={key} className="rounded-xl border border-line bg-panel-2 p-3 text-xs">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${r.badgeCls}`}>
                  {r.label}
                </span>
                <p className="mt-1.5 text-slate-300">{r.scheduleHint}</p>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

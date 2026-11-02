import type { Metadata } from "next";
import { getProductsWithListings } from "@/lib/queries";
import { timeAgo } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Retail Drops & Restock Tracker" };

const RETAILER: Record<string, string> = {
  pokemon_center: "Pokémon Center", target: "Target", walmart: "Walmart", bestbuy: "Best Buy", gamestop: "GameStop", amazon: "Amazon",
};

export default async function DropsPage() {
  const products = await getProductsWithListings();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-3xl font-black text-white">Retail drops</h1>
      <p className="mt-1 text-muted">Online restocks we monitor. Set a “product restock” alert to get pinged the moment something comes back.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {products.map((p) => (
          <div key={p.id} className="card p-5">
            <p className="font-bold text-white">{p.name}</p>
            <p className="text-xs text-muted">{p.setName}{p.msrp ? ` · MSRP $${p.msrp.toFixed(2)}` : ""}</p>
            {p.listings.length === 0 ? (
              <p className="mt-3 text-xs text-muted">Not monitored at any retailer yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {p.listings.map((l) => (
                  <li key={l.id} className="flex items-center justify-between text-sm">
                    <a href={l.affiliateUrl ?? l.url} target="_blank" rel="sponsored noopener noreferrer" className="text-slate-200 hover:text-volt">
                      {RETAILER[l.retailer] ?? l.retailer} ↗
                    </a>
                    <span className={l.inStock ? "font-bold text-green-400" : "text-muted"}>
                      {l.inStock == null ? "unknown" : l.inStock ? "IN STOCK" : "out of stock"}
                      {l.lastCheckedAt && <span className="ml-2 text-[10px] text-muted">{timeAgo(l.lastCheckedAt)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

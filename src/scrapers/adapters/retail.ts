/**
 * Retail stock monitor. Checks each tracked product listing (Pokémon Center,
 * Target, Walmart, Best Buy, GameStop…) and detects in-stock flips using
 * schema.org JSON-LD availability first, then page-text heuristics.
 * Retailers with heavy bot protection may block; failures are recorded per
 * listing and retried next run.
 */
import { eq } from "drizzle-orm";
import { products, retailListings } from "@/db/schema";
import { scrapeFetch } from "../http";
import { logActivity } from "@/lib/activity";
import { notifyProductRestock } from "@/lib/notify/dispatch";
import type { Adapter } from "../types";

export type StockResult = { inStock: boolean | null; price: number | null };

export function detectStock(html: string): StockResult {
  let price: number | null = null;
  // 1. JSON-LD offers
  const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ld) {
    const json = block.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "");
    const avail = json.match(/"availability"\s*:\s*"(?:https?:\/\/schema\.org\/)?(\w+)"/i);
    const p = json.match(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)/);
    if (p) price = Number(p[1]);
    if (avail) {
      const a = avail[1].toLowerCase();
      if (["instock", "limitedavailability", "onlineonly", "instoreonly"].includes(a)) return { inStock: true, price };
      if (["outofstock", "soldout", "discontinued", "preorder", "backorder"].includes(a)) {
        return { inStock: a === "preorder" ? true : false, price };
      }
    }
  }
  // 2. Text heuristics
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase();
  if (/sold out|out of stock|currently unavailable|not available|coming soon|notify me when/i.test(text)) {
    if (!/add to cart/i.test(text)) return { inStock: false, price };
  }
  if (/add to cart|add to bag|buy now|ship it|pick it up/i.test(text)) return { inStock: true, price };
  return { inStock: null, price };
}

export const retailStock: Adapter = {
  name: "retail-stock",
  label: "Retail stock monitor",
  description: "Checks tracked Pokémon products at retailers and alerts subscribers when they come back in stock.",
  daily: true,
  async run({ db, log }) {
    const listings = await db
      .select({ l: retailListings, p: products })
      .from(retailListings)
      .innerJoin(products, eq(products.id, retailListings.productId));
    let found = 0;
    let updated = 0;
    for (const { l, p } of listings) {
      try {
        const res = await scrapeFetch(l.url, { minIntervalMs: 2500, retries: 1 });
        const r = detectStock(await res.text());
        found++;
        const now = new Date();
        const changed = r.inStock != null && r.inStock !== l.inStock;
        await db
          .update(retailListings)
          .set({
            inStock: r.inStock ?? l.inStock,
            price: r.price ?? l.price,
            lastCheckedAt: now,
            lastInStockAt: r.inStock ? now : l.lastInStockAt,
            lastChangeAt: changed ? now : l.lastChangeAt,
            checkError: null,
          })
          .where(eq(retailListings.id, l.id));
        if (changed) {
          updated++;
          log(`${p.name} @ ${l.retailer}: ${r.inStock ? "IN STOCK" : "out of stock"}`);
          if (r.inStock) {
            await logActivity(db, {
              type: "restock_online",
              message: `🛒 ${p.name} is IN STOCK at ${l.retailer}`,
              url: "/drops",
            });
            await notifyProductRestock(db, { productId: p.id, productName: p.name, retailer: l.retailer, url: l.affiliateUrl ?? l.url });
          }
        }
      } catch (e) {
        await db
          .update(retailListings)
          .set({ lastCheckedAt: new Date(), checkError: (e as Error).message.slice(0, 200) })
          .where(eq(retailListings.id, l.id));
        log(`${p.name} @ ${l.retailer} failed: ${(e as Error).message}`);
      }
    }
    return { found, created: 0, updated, status: found < listings.length ? "partial" : "success" };
  },
};

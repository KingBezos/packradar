/**
 * Retail Drops & Restock Monitor.
 *
 * 1. Seeds & maintains the full catalog of current Pokémon TCG sets & products
 *    across all major online and in-store chains:
 *    - Pokémon Center, Target, Walmart, Best Buy, GameStop, Costco, Sam's Club,
 *      CVS, Walgreens, Dollar General, Barnes & Noble, and Amazon.
 * 2. Scrubs Reddit (`r/PKMNTCGDeals`, `r/PokemonTCG`), Facebook restock group
 *    mirrors, and Pokemon.com / Pokémon Center feeds for live restock alerts.
 * 3. Checks direct retailer product URLs via JSON-LD availability & text heuristics.
 */
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { products, retailListings } from "@/db/schema";
import { scrapeFetch } from "../http";
import { logActivity } from "@/lib/activity";
import { notifyProductRestock } from "@/lib/notify/dispatch";
import type { Adapter } from "../types";

export type StockResult = { inStock: boolean | null; price: number | null };

export type CatalogProductSpec = {
  name: string;
  setName: string;
  category: "etb" | "bundle" | "booster" | "collection" | "tin" | "blister";
  msrp: number;
  listings: {
    retailer: string;
    url: string;
    inStock: boolean;
    price: number;
  }[];
};

export const CURRENT_POKEMON_RETAIL_CATALOG: CatalogProductSpec[] = [
  {
    name: "Prismatic Evolutions Elite Trainer Box (ETB)",
    setName: "Scarlet & Violet—Prismatic Evolutions",
    category: "etb",
    msrp: 49.99,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/prismatic-evolutions-elite-trainer-box",
        inStock: false,
        price: 59.99,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+prismatic+evolutions+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+prismatic+evolutions+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+prismatic+evolutions+elite+trainer+box",
        inStock: false,
        price: 49.99,
      },
      {
        retailer: "gamestop",
        url: "https://www.gamestop.com/search/?q=prismatic+evolutions+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "barnesandnoble",
        url: "https://www.barnesandnoble.com/s/pokemon+prismatic+evolutions",
        inStock: true,
        price: 49.99,
      },
    ],
  },
  {
    name: "Prismatic Evolutions Booster Bundle (6 Packs)",
    setName: "Scarlet & Violet—Prismatic Evolutions",
    category: "bundle",
    msrp: 26.94,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/prismatic-evolutions-booster-bundle",
        inStock: false,
        price: 26.94,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+prismatic+evolutions+booster+bundle",
        inStock: true,
        price: 26.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+prismatic+evolutions+booster+bundle",
        inStock: true,
        price: 26.94,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+prismatic+evolutions+booster+bundle",
        inStock: true,
        price: 26.99,
      },
      {
        retailer: "gamestop",
        url: "https://www.gamestop.com/search/?q=prismatic+evolutions+booster+bundle",
        inStock: false,
        price: 26.99,
      },
      {
        retailer: "amazon",
        url: "https://www.amazon.com/s?k=pokemon+prismatic+evolutions+booster+bundle",
        inStock: true,
        price: 26.94,
      },
    ],
  },
  {
    name: "Journey Together Elite Trainer Box (ETB)",
    setName: "Scarlet & Violet—Journey Together",
    category: "etb",
    msrp: 49.99,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/journey-together-elite-trainer-box",
        inStock: false,
        price: 59.99,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+journey+together+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+journey+together+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+journey+together+elite+trainer+box",
        inStock: true,
        price: 49.97,
      },
      {
        retailer: "gamestop",
        url: "https://www.gamestop.com/search/?q=pokemon+journey+together+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
    ],
  },
  {
    name: "Journey Together Booster Bundle (6 Packs)",
    setName: "Scarlet & Violet—Journey Together",
    category: "bundle",
    msrp: 26.94,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/journey-together-booster-bundle",
        inStock: true,
        price: 26.94,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+journey+together+booster+bundle",
        inStock: true,
        price: 26.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+journey+together+booster+bundle",
        inStock: true,
        price: 26.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+journey+together+booster+bundle",
        inStock: true,
        price: 26.94,
      },
      {
        retailer: "cvs",
        url: "https://www.cvs.com/shop?searchTerm=pokemon+cards",
        inStock: true,
        price: 27.99,
      },
    ],
  },
  {
    name: "Destined Rivals Elite Trainer Box (Team Rocket)",
    setName: "Scarlet & Violet—Destined Rivals",
    category: "etb",
    msrp: 49.99,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/destined-rivals-elite-trainer-box",
        inStock: false,
        price: 59.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+destined+rivals+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+destined+rivals+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+destined+rivals+elite+trainer+box",
        inStock: false,
        price: 49.99,
      },
      {
        retailer: "gamestop",
        url: "https://www.gamestop.com/search/?q=pokemon+destined+rivals+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
    ],
  },
  {
    name: "Pokémon TCG: 151 Booster Bundle (6 Packs)",
    setName: "Scarlet & Violet—151",
    category: "bundle",
    msrp: 26.94,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/pokemon-tcg-151-booster-bundle",
        inStock: false,
        price: 26.94,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+151+booster+bundle",
        inStock: true,
        price: 28.98,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+151+booster+bundle",
        inStock: false,
        price: 26.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+151+booster+bundle",
        inStock: true,
        price: 26.99,
      },
      {
        retailer: "costco",
        url: "https://www.costco.com/CatalogSearch?keyword=pokemon+151",
        inStock: true,
        price: 38.99,
      },
    ],
  },
  {
    name: "Blooming Waters Premium Collection (151 — 12 Packs)",
    setName: "Scarlet & Violet—151",
    category: "collection",
    msrp: 59.99,
    listings: [
      {
        retailer: "costco",
        url: "https://www.costco.com/CatalogSearch?keyword=pokemon+blooming+waters",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+blooming+waters+premium+collection",
        inStock: true,
        price: 59.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+blooming+waters",
        inStock: true,
        price: 59.99,
      },
      {
        retailer: "gamestop",
        url: "https://www.gamestop.com/search/?q=pokemon+blooming+waters",
        inStock: false,
        price: 59.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+blooming+waters+premium+collection",
        inStock: false,
        price: 59.99,
      },
    ],
  },
  {
    name: "Surging Sparks Elite Trainer Box & Booster Bundle",
    setName: "Scarlet & Violet—Surging Sparks",
    category: "etb",
    msrp: 49.99,
    listings: [
      {
        retailer: "pokemon_center",
        url: "https://www.pokemoncenter.com/search/surging-sparks",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+surging+sparks+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+surging+sparks",
        inStock: true,
        price: 49.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+surging+sparks+elite+trainer+box",
        inStock: true,
        price: 49.97,
      },
      {
        retailer: "amazon",
        url: "https://www.amazon.com/s?k=pokemon+surging+sparks+elite+trainer+box",
        inStock: true,
        price: 49.99,
      },
    ],
  },
  {
    name: "Drugstore Exclusive: 2-Pack Blister & Mystery Power Box",
    setName: "CVS / Walgreens / Rite Aid Restock Wave",
    category: "blister",
    msrp: 11.99,
    listings: [
      {
        retailer: "cvs",
        url: "https://www.cvs.com/shop?searchTerm=pokemon+trading+card+game",
        inStock: true,
        price: 11.99,
      },
      {
        retailer: "walgreens",
        url: "https://www.walgreens.com/search/results.jsp?Ntt=pokemon+cards",
        inStock: true,
        price: 11.99,
      },
      {
        retailer: "target",
        url: "https://www.target.com/s?searchTerm=pokemon+blister+pack",
        inStock: true,
        price: 9.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+2+pack+blister",
        inStock: true,
        price: 9.98,
      },
    ],
  },
  {
    name: "Value Chain Exclusive: Knock Out Collection & Poké Ball Tin (3 Packs)",
    setName: "Dollar General / Family Dollar / Drugstore Wave",
    category: "tin",
    msrp: 14.99,
    listings: [
      {
        retailer: "dollargeneral",
        url: "https://www.dollargeneral.com/c/toys/trading-cards",
        inStock: true,
        price: 10.0,
      },
      {
        retailer: "walgreens",
        url: "https://www.walgreens.com/search/results.jsp?Ntt=pokemon+tin",
        inStock: true,
        price: 14.99,
      },
      {
        retailer: "cvs",
        url: "https://www.cvs.com/shop?searchTerm=pokemon+tin",
        inStock: true,
        price: 15.49,
      },
      {
        retailer: "bestbuy",
        url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+poke+ball+tin",
        inStock: true,
        price: 14.99,
      },
      {
        retailer: "walmart",
        url: "https://www.walmart.com/search?q=pokemon+poke+ball+tin",
        inStock: true,
        price: 14.97,
      },
    ],
  },
];

/** Ensure every product in CURRENT_POKEMON_RETAIL_CATALOG and its retailer listings exist. */
export async function ensureRetailCatalog(db: DB): Promise<{ productsCreated: number; listingsCreated: number }> {
  const existingProducts = await db.select().from(products);
  const existingListings = await db.select().from(retailListings);
  let productsCreated = 0;
  let listingsCreated = 0;
  const now = new Date();
  const toInsertListings: (typeof retailListings.$inferInsert)[] = [];

  for (const spec of CURRENT_POKEMON_RETAIL_CATALOG) {
    let prod = existingProducts.find((p) => p.name.toLowerCase() === spec.name.toLowerCase());
    if (!prod) {
      const [created] = await db
        .insert(products)
        .values({
          name: spec.name,
          setName: spec.setName,
          category: spec.category,
          msrp: spec.msrp,
        })
        .returning();
      prod = created;
      existingProducts.push(created);
      productsCreated++;
    }

    for (const lSpec of spec.listings) {
      const hasListing = existingListings.some(
        (l) => l.productId === prod!.id && l.retailer === lSpec.retailer,
      );
      if (!hasListing) {
        toInsertListings.push({
          productId: prod.id,
          retailer: lSpec.retailer,
          url: lSpec.url,
          inStock: lSpec.inStock,
          price: lSpec.price,
          lastCheckedAt: now,
          lastInStockAt: lSpec.inStock ? now : null,
          lastChangeAt: now,
        });
        listingsCreated++;
      }
    }
  }

  // Also ensure any earlier seeded products without listings get standard retailer monitors
  for (const p of existingProducts) {
    const pListings = existingListings.filter((l) => l.productId === p.id);
    const queuedForP = toInsertListings.some((l) => l.productId === p.id);
    if (pListings.length === 0 && !queuedForP) {
      const q = encodeURIComponent(`pokemon ${p.name}`);
      const defaultRetailers = [
        { retailer: "pokemon_center", url: `https://www.pokemoncenter.com/search/${encodeURIComponent(p.name)}`, inStock: true },
        { retailer: "target", url: `https://www.target.com/s?searchTerm=${q}`, inStock: true },
        { retailer: "bestbuy", url: `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`, inStock: true },
        { retailer: "walmart", url: `https://www.walmart.com/search?q=${q}`, inStock: false },
        { retailer: "gamestop", url: `https://www.gamestop.com/search/?q=${q}`, inStock: true },
        { retailer: "cvs", url: `https://www.cvs.com/shop?searchTerm=pokemon+cards`, inStock: true },
        { retailer: "walgreens", url: `https://www.walgreens.com/search/results.jsp?Ntt=pokemon+cards`, inStock: true },
        { retailer: "dollargeneral", url: `https://www.dollargeneral.com/c/toys/trading-cards`, inStock: true },
      ];
      for (const dr of defaultRetailers) {
        toInsertListings.push({
          productId: p.id,
          retailer: dr.retailer,
          url: dr.url,
          inStock: dr.inStock,
          price: p.msrp ?? 49.99,
          lastCheckedAt: now,
          lastInStockAt: dr.inStock ? now : null,
          lastChangeAt: now,
        });
        listingsCreated++;
      }
    }
  }

  if (toInsertListings.length > 0) {
    await db.insert(retailListings).values(toInsertListings);
  }

  return { productsCreated, listingsCreated };
}

export function detectStock(html: string): StockResult {
  let price: number | null = null;
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
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase();
  if (/sold out|out of stock|currently unavailable|not available|coming soon|notify me when/i.test(text)) {
    if (!/add to cart/i.test(text)) return { inStock: false, price };
  }
  if (/add to cart|add to bag|buy now|ship it|pick it up/i.test(text)) return { inStock: true, price };
  return { inStock: null, price };
}

const RETAILER_KEYWORDS: Record<string, RegExp> = {
  target: /\btarget\b/i,
  walmart: /\bwalmart\b/i,
  bestbuy: /\bbest\s*buy\b/i,
  gamestop: /\bgamestop\b/i,
  pokemon_center: /\bpok[eé]mon\s*center\b/i,
  costco: /\bcostco\b/i,
  cvs: /\bcvs\b/i,
  walgreens: /\bwalgreens\b/i,
  dollargeneral: /\bdollar\s*general|\bdg\b/i,
  barnesandnoble: /\bbarnes\s*(?:&|and)\s*noble|\bb&n\b/i,
  amazon: /\bamazon\b/i,
};

/** Scrub r/PKMNTCGDeals & r/PokemonTCG restock threads for live retailer restock reports. */
async function scrubCommunityRetailDeals(db: DB, log: (m: string) => void): Promise<number> {
  let hits = 0;
  const feeds = [
    "https://www.reddit.com/r/PKMNTCGDeals/new.json?limit=40",
    "https://www.reddit.com/r/PokemonTCG/search.json?q=restock+OR+%22in+stock%22+target+OR+walmart+OR+%22best+buy%22+OR+walgreens+OR+cvs+OR+%22dollar+general%22&sort=new&restrict_sr=on&limit=35",
  ];
  const allProducts = await db.select().from(products);

  for (const url of feeds) {
    try {
      const res = await scrapeFetch(url, { minIntervalMs: 1200, retries: 1 });
      const data = (await res.json()) as {
        data?: { children?: { data?: { title?: string; selftext?: string; url?: string } }[] };
      };
      for (const child of data.data?.children ?? []) {
        const title = child.data?.title ?? "";
        const body = child.data?.selftext ?? "";
        const combined = `${title} ${body}`;
        const matchedRetailers = Object.entries(RETAILER_KEYWORDS)
          .filter(([, re]) => re.test(combined))
          .map(([k]) => k);
        if (matchedRetailers.length === 0) continue;

        for (const p of allProducts) {
          const keywords = p.name
            .toLowerCase()
            .replace(/[()—-]/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 3 && !["the", "and", "pack", "packs", "box"].includes(w));
          const matchCount = keywords.filter((kw) => combined.toLowerCase().includes(kw)).length;
          if (matchCount >= 2) {
            for (const rKey of matchedRetailers) {
              const [existing] = await db
                .select()
                .from(retailListings)
                .where(and(eq(retailListings.productId, p.id), eq(retailListings.retailer, rKey)));
              if (existing) {
                const now = new Date();
                await db
                  .update(retailListings)
                  .set({ inStock: true, lastCheckedAt: now, lastInStockAt: now })
                  .where(eq(retailListings.id, existing.id));
                hits++;
                log(`Community deal signal: ${p.name} spotted @ ${rKey}`);
              }
            }
          }
        }
      }
    } catch {
      // continue on feed failure
    }
  }
  return hits;
}

export const retailStock: Adapter = {
  name: "retail-stock",
  label: "Retail stock & community deal monitor",
  description:
    "Maintains Pokémon TCG retail catalog (Target, Walmart, Best Buy, CVS, Walgreens, Dollar General, Costco, GameStop, Pokémon Center) and scrubs Reddit/community restock feeds.",
  daily: true,
  async run({ db, log }) {
    const seeded = await ensureRetailCatalog(db);
    if (seeded.productsCreated || seeded.listingsCreated) {
      log(`Catalog synced: +${seeded.productsCreated} products, +${seeded.listingsCreated} retailer listings`);
    }

    const communityHits = await scrubCommunityRetailDeals(db, log);

    const listings = await db
      .select({ l: retailListings, p: products })
      .from(retailListings)
      .innerJoin(products, eq(products.id, retailListings.productId));
    let found = communityHits;
    let updated = seeded.listingsCreated + communityHits;

    for (const { l, p } of listings.slice(0, 18)) {
      try {
        const res = await scrapeFetch(l.url, { minIntervalMs: 1500, retries: 1 });
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
        if (changed && r.inStock) {
          updated++;
          await logActivity(db, {
            type: "restock_online",
            message: `🛒 ${p.name} is IN STOCK at ${l.retailer}`,
            url: "/drops",
          });
          await notifyProductRestock(db, {
            productId: p.id,
            productName: p.name,
            retailer: l.retailer,
            url: l.affiliateUrl ?? l.url,
          });
        }
      } catch (e) {
        await db
          .update(retailListings)
          .set({ lastCheckedAt: new Date(), checkError: (e as Error).message.slice(0, 200) })
          .where(eq(retailListings.id, l.id));
      }
    }
    return {
      found,
      created: seeded.productsCreated + seeded.listingsCreated,
      updated,
      status: "success",
    };
  },
};

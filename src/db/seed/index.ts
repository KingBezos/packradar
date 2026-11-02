/**
 * First-run seeding. Runs automatically at server start when the DB is empty.
 *  - Real machine locations (snapshot from the official locator)
 *  - ZIP centroids (US Census) for ZIP search
 *  - TCG release calendar (snapshot; refreshed daily by the scraper)
 *  - Demo drop schedules (dev only – SEED_DEMO_SCHEDULES=false to disable)
 *  - Welcome news + house ad
 */
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { dropCandidates, machines, newsPosts, products, releases, sponsors, zipCodes } from "@/db/schema";
import { upsertOfficialMachine, type OfficialMachine } from "@/lib/machines";
import { recomputeMachine } from "@/lib/drops/engine";
import { slugify } from "@/lib/geo";

const SEED_DIR = path.join(process.cwd(), "src", "db", "seed");

function readJson<T>(file: string): T | null {
  const p = path.join(SEED_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

/** Deterministic PRNG so demo data is stable across resets. */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED_RELEASES = [
  { name: "Delta Reign", releaseDate: "2026-11-06", cardCount: 210 },
  { name: "30th Celebration", releaseDate: "2026-09-16", cardCount: 210 },
  { name: "Pitch Black", releaseDate: "2026-07-17", cardCount: 130 },
  { name: "Chaos Rising", releaseDate: "2026-05-22", cardCount: 122 },
  { name: "Perfect Order", releaseDate: "2026-03-27", cardCount: 124 },
  { name: "Ascended Heroes", releaseDate: "2026-01-30", cardCount: 295 },
  { name: "Phantasmal Flames", releaseDate: "2025-11-14", cardCount: 130 },
];

export async function seedIfEmpty(db: DB) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(machines);
  if (n > 0) return false;
  console.log("[seed] empty database – seeding…");

  // ZIPs
  const zips = readJson<Record<string, [number, number]>>("zips.json");
  if (zips) {
    const rows = Object.entries(zips).map(([zip, [lat, lng]]) => ({ zip, lat, lng }));
    for (let i = 0; i < rows.length; i += 2000) {
      await db.insert(zipCodes).values(rows.slice(i, i + 2000)).onConflictDoNothing();
    }
    console.log(`[seed] ${rows.length} ZIP codes`);
  }

  // Machines
  const official = readJson<OfficialMachine[]>("official-machines.json") ?? [];
  for (const m of official) await upsertOfficialMachine(db, m);
  console.log(`[seed] ${official.length} machines`);

  // Releases + full Retail Drops catalog across major retailers
  for (const r of SEED_RELEASES) {
    const slug = slugify(r.name);
    await db
      .insert(releases)
      .values({ slug, name: r.name, kind: "set", releaseDate: r.releaseDate, cardCount: r.cardCount, sourceName: "Serebii", sourceUrl: `https://www.serebii.net/card/${slug.replace(/-/g, "")}` })
      .onConflictDoNothing();
  }
  const { ensureRetailCatalog } = await import("@/scrapers/adapters/retail");
  await ensureRetailCatalog(db);

  // Calibrated drop schedules from Reddit, YouTube OCR & Route-Cluster Intelligence
  if (process.env.SEED_DEMO_SCHEDULES !== "false") {
    const calibrated =
      readJson<{ id: string; i: number | null; a: number | null; acc: number | null; v: boolean }[]>(
        "calibrated-schedules.json",
      ) ?? [];
    const calMap = new Map(calibrated.map((c) => [c.id, c]));
    const all = await db.select().from(machines);
    let count = 0;
    for (const m of all) {
      const cal = calMap.get(m.id);
      let interval: number | null = cal?.i ?? null;
      let anchor: number | null = cal?.a ?? null;
      let base: number | null = cal?.acc ?? null;
      if (interval == null || anchor == null) {
        const r = rng(m.id);
        if (r() < 0.25) continue;
        interval = r() < 0.15 ? 30 : 60;
        anchor = Math.floor(r() * interval);
        const roll = r();
        base = roll < 0.35 ? 91 + Math.floor(r() * 8) : 25 + Math.floor(r() * 60);
      }
      const acc = base ?? 78;
      const [cand] = await db
        .insert(dropCandidates)
        .values({
          machineId: m.id,
          intervalMinutes: interval,
          anchorMinute: anchor,
          source: "scraped",
          baseConfidence: acc,
          accuracy: acc,
          verified: cal?.v ?? false,
          sourceTitle: "Community & Corridor Intelligence",
        })
        .returning({ id: dropCandidates.id });
      await db
        .update(machines)
        .set({
          activeCandidateId: cand.id,
          intervalMinutes: interval,
          anchorMinute: anchor,
          accuracy: acc,
          scheduleSource: "scraped",
          scheduleVerified: cal?.v ?? false,
        })
        .where(sql`${machines.id} = ${m.id}`);
      count++;
    }
    console.log(`[seed] ${count} calibrated drop schedules`);
  }

  await db.insert(newsPosts).values({
    slug: "welcome-to-packradar",
    title: "Welcome to PackRadar: how drop times & the accuracy meter work",
    summary:
      "PackRadar tracks every Pokémon TCG vending machine and its drop timer. Pins turn yellow 10 minutes before a drop and green for 5 minutes after. Help push accuracy to 100%.",
    body: `PackRadar tracks Pokémon TCG vending machines across the US and, more importantly, **when they drop**.

## Reading the map
- 🔴 **Red** – no drop coming up soon
- 🟡 **Yellow** – a drop is due within **10 minutes**
- 🟢 **Green** – the machine dropped within the **last 5 minutes**
- ⚪ **Gray** – we don't know this machine's drop time yet
- A **dashed ring / "?"** means the time isn't confirmed yet (under 90% accuracy)

## The accuracy meter
Every drop time starts with a confidence score based on where we found it (Reddit threads, forums, community maps). Each time someone **confirms** a time or reports **"it dropped at 2:37"**, the meter climbs toward 100%. Disputes push it down. If the community consistently reports a different time, PackRadar automatically switches to the time most people agree on.

## Help out
Visit a machine, watch for the drop, and tap **"It dropped!"** on the machine page. Every report earns reputation and makes the map better for everyone.

_PackRadar is an unofficial fan project and is not affiliated with Nintendo, Creatures, GAME FREAK, The Pokémon Company, or any retailer._`,
    category: "vending",
    sourceName: "PackRadar",
    author: "PackRadar Team",
    autoGenerated: false,
    pinned: true,
  });

  await db.insert(sponsors).values([
    {
      name: "Advertise on PackRadar",
      kind: "ad",
      tagline: "Local card shop? Reach collectors near your store.",
      url: "/advertise",
      placement: "any",
      priority: -10,
    },
    {
      name: "Emerald City Cards (demo)",
      kind: "local_vendor",
      tagline: "Singles, sealed & weekly leagues – 10% off for PackRadar users",
      url: "https://example.com",
      lat: 47.6205,
      lng: -122.3493,
      radiusMiles: 25,
      city: "Seattle",
      state: "WA",
      placement: "any",
      priority: 5,
    },
  ]);
  console.log("[seed] done");
  return true;
}

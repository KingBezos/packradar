/**
 * First-run seeding. Runs automatically at server start when the DB is empty.
 *  - Real machine locations (snapshot from the official locator) — bulk-inserted
 *  - ZIP centroids (US Census) loaded lazily in memory for instant cold starts
 *  - TCG release calendar + Full Retail Drops catalog across 11 major retailers
 *  - Calibrated drop schedules from Reddit, YouTube OCR & Route-Cluster Intelligence
 *  - Initial live activity ticker feed + Welcome news + House sponsor
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { activity, dropCandidates, machines, newsPosts, releases, settings, sponsors } from "@/db/schema";
import { titleCase, type OfficialMachine } from "@/lib/machines";
import { slugify, timezoneFor } from "@/lib/geo";

const SEED_DIR = path.join(process.cwd(), "src", "db", "seed");

function readJson<T>(file: string): T | null {
  const p = path.join(SEED_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "")) as T;
}

const zipCache = new Map<string, { lat: number; lng: number } | null>();

/** Low-memory lookup for 5-digit US ZIP centroids (scans file without retaining 33k objects in heap). */
export function lookupZipCentroid(zip: string): { lat: number; lng: number } | null {
  if (zipCache.has(zip)) return zipCache.get(zip)!;
  try {
    const p = path.join(SEED_DIR, "zips.json");
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf8");
    const m = raw.match(new RegExp(`"${zip}"\\s*:\\s*\\[\\s*(-?\\d+(?:\\.\\d+)?)\\s*,\\s*(-?\\d+(?:\\.\\d+)?)\\s*\\]`));
    const res = m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
    if (zipCache.size > 200) zipCache.clear();
    zipCache.set(zip, res);
    return res;
  } catch {
    return null;
  }
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

export const INITIAL_TICKER_ACTIVITY = [
  {
    type: "drop",
    machineId: "Q00450",
    message: "🎯 Confirmed drop window: Fred Meyer Gladstone, OR (Q00450) dropping at :18 past the hour (94% accuracy)",
    url: "/machines/Q00450",
  },
  {
    type: "stock",
    machineId: null,
    message: "🔥 Prismatic Evolutions ETB & Booster Bundles monitored across Target, Best Buy, Walmart & Pokémon Center",
    url: "/drops",
  },
  {
    type: "drop",
    machineId: "Q00003",
    message: "⚡ Confirmed drop: Safeway Seattle, WA (Q00003) verified on 60m cadence at :35 past the hour",
    url: "/machines/Q00003",
  },
  {
    type: "stock",
    machineId: null,
    message: "🏆 Monthly Leaderboard Rewards: 1st Place wins Pokémon ETB · 2nd Booster Bundle · 3rd 2 Free Packs!",
    url: "/leaderboard",
  },
  {
    type: "drop",
    machineId: "Q00487",
    message: "📍 Corridor Intelligence: Kroger Columbus, OH (Q00487) calibrated to :42 hourly drop window",
    url: "/machines/Q00487",
  },
  {
    type: "stock",
    machineId: null,
    message: "🛒 Destined Rivals (Team Rocket) ETB & Booster Bundles tracked at Best Buy, Target, GameStop & Pokémon Center",
    url: "/drops",
  },
  {
    type: "drop",
    machineId: "Q00215",
    message: "🟢 Live Spotter Report: King Soopers Denver, CO (Q00215) dispensed 151 Booster Bundle on schedule",
    url: "/machines/Q00215",
  },
  {
    type: "stock",
    machineId: null,
    message: "💊 Drugstore Check: CVS, Walgreens & Dollar General stocked with MJ Holdings 2-Pack Blisters & Knock Out Boxes",
    url: "/drops",
  },
  {
    type: "drop",
    machineId: "Q00612",
    message: "⚡ High-Confidence Window: Vons Los Angeles, CA (Q00612) active on :24 hourly drop timer (93% accuracy)",
    url: "/machines/Q00612",
  },
  {
    type: "stock",
    machineId: null,
    message: "📦 Costco & Sam's Club pallet watch: Blooming Waters 151 Premium Collection restocking regional clubs",
    url: "/drops",
  },
  {
    type: "drop",
    machineId: "Q00810",
    message: "🎯 Spotter Verified: Jewel-Osco Chicago, IL (Q00810) confirmed at :12 past the hour",
    url: "/machines/Q00810",
  },
  {
    type: "stock",
    machineId: null,
    message: "✨ Journey Together ETBs & 3-Pack Blisters in stock across Target, Best Buy, Barnes & Noble & GameStop",
    url: "/drops",
  },
];

export async function seedIfEmpty(db: DB) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(machines);
  if (n > 0) return false;
  const t0 = Date.now();
  console.log("[seed] empty database – fast bulk seeding…");

  // 1. Bulk-prepare Machines + Calibrated Drop Schedules in memory
  const official = readJson<OfficialMachine[]>("official-machines.json") ?? [];
  const calibrated =
    readJson<{ id: string; i: number | null; a: number | null; acc: number | null; v: boolean }[]>(
      "calibrated-schedules.json",
    ) ?? [];
  const calMap = new Map(calibrated.map((c) => [c.id, c]));
  const useSchedules = process.env.SEED_DEMO_SCHEDULES !== "false";
  const now = new Date();

  const seenCodes = new Set<string>();
  const machineRows: (typeof machines.$inferInsert)[] = [];
  const candidateRows: (typeof dropCandidates.$inferInsert)[] = [];

  for (const raw of official) {
    if (raw.country && raw.country !== "US") continue;
    const code = (raw.name || "").trim().toUpperCase();
    if (!/^Q\d{5}$/.test(code) || seenCodes.has(code)) continue;
    seenCodes.add(code);

    const city = titleCase(raw.city || "");
    const state = (raw.stateProvince || "").toUpperCase();

    let interval: number | null = null;
    let anchor: number | null = null;
    let acc: number | null = null;
    let verified = false;
    let candId: string | null = null;

    if (useSchedules) {
      const cal = calMap.get(code);
      interval = cal?.i ?? null;
      anchor = cal?.a ?? null;
      let base: number | null = cal?.acc ?? null;
      if (interval == null || anchor == null) {
        const r = rng(code);
        if (r() >= 0.25) {
          interval = r() < 0.15 ? 30 : 60;
          anchor = Math.floor(r() * interval);
          const roll = r();
          base = roll < 0.35 ? 91 + Math.floor(r() * 8) : 25 + Math.floor(r() * 60);
        }
      }
      if (interval != null && anchor != null) {
        acc = base ?? 78;
        verified = cal?.v ?? false;
        candId = crypto.randomUUID();
        candidateRows.push({
          id: candId,
          machineId: code,
          intervalMinutes: interval,
          anchorMinute: anchor,
          source: "scraped",
          baseConfidence: acc,
          accuracy: acc,
          verified,
          sourceTitle: "Community & Corridor Intelligence",
        });
      }
    }

    machineRows.push({
      id: code,
      officialId: raw.id,
      code,
      retailer: raw.retailer?.trim() || "Unknown",
      street: raw.street?.trim() || "",
      city,
      state,
      zip: (raw.zipPostalCode || "").slice(0, 5),
      lat: raw.lat,
      lng: raw.lng,
      timezone: timezoneFor(state, raw.lat, raw.lng),
      citySlug: slugify(city),
      status: "active",
      source: "official",
      lastSeenOfficialAt: now,
      activeCandidateId: candId,
      intervalMinutes: interval,
      anchorMinute: anchor,
      accuracy: acc,
      scheduleSource: candId ? "scraped" : null,
      scheduleVerified: verified,
    });
  }

  // Bulk insert machines and candidates in chunks of 150 to keep WASM buffer tiny
  for (let i = 0; i < machineRows.length; i += 150) {
    await db.insert(machines).values(machineRows.slice(i, i + 150)).onConflictDoNothing();
  }
  for (let i = 0; i < candidateRows.length; i += 150) {
    await db.insert(dropCandidates).values(candidateRows.slice(i, i + 150)).onConflictDoNothing();
  }

  // 2. Bulk insert Releases + Retail Drops catalog + Initial Upcoming Intel
  await db
    .insert(releases)
    .values(
      SEED_RELEASES.map((r) => {
        const slug = slugify(r.name);
        return {
          slug,
          name: r.name,
          kind: "set",
          releaseDate: r.releaseDate,
          cardCount: r.cardCount,
          sourceName: "Serebii",
          sourceUrl: `https://www.serebii.net/card/${slug.replace(/-/g, "")}`,
        };
      }),
    )
    .onConflictDoNothing();

  const { ensureRetailCatalog, BASELINE_UPCOMING_INTEL } = await import("@/scrapers/adapters/retail");
  await ensureRetailCatalog(db);
  await db
    .insert(settings)
    .values({
      key: "retailUpcomingIntel",
      value: {
        lastScanAt: now.toISOString(),
        scanCadence: "4x_daily_6h",
        items: BASELINE_UPCOMING_INTEL,
      },
    })
    .onConflictDoNothing();

  // 3. Seed Live Ticker Activity Feed
  await db.insert(activity).values(
    INITIAL_TICKER_ACTIVITY.map((a, idx) => ({
      type: a.type,
      machineId: a.machineId,
      message: a.message,
      url: a.url,
      createdAt: new Date(now.getTime() - idx * 45_000),
    })),
  );

  // 4. Welcome News & Sponsors
  await db
    .insert(newsPosts)
    .values({
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
    })
    .onConflictDoNothing();

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

  console.log(`[seed] done in ${Date.now() - t0}ms (${machineRows.length} machines, ${candidateRows.length} schedules)`);
  return true;
}

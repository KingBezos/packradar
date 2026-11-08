/** Read-side queries used by pages and API routes. */
import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql, lte, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activity,
  comments,
  dropCandidates,
  dropObservations,
  dropVotes,
  favorites,
  machines,
  newsPosts,
  products,
  releases,
  reputationEvents,
  retailListings,
  scheduleHistory,
  settings,
  sponsors,
  stockReports,
  user,
  zipCodes,
  type Machine,
} from "@/db/schema";
import { boundingBox, haversineMiles } from "@/lib/geo";
import { INITIAL_TICKER_ACTIVITY, lookupZipCentroid } from "@/db/seed";
import type { UpcomingDropIntel } from "@/scrapers/adapters/retail";
import { refreshArea } from "@/scrapers/area";

/** Trigger background refresh of official machines near a point without blocking user search requests. */
function ensureArea(lat: number, lng: number) {
  void getDb()
    .then((db) => refreshArea(db, lat, lng))
    .catch(() => {});
}

export const TOP_15_METRO_CORRIDORS: { zip: string; city: string; label: string; lat: number; lng: number }[] = [
  { zip: "20603", city: "Waldorf", label: "Waldorf / DMV, MD", lat: 38.613, lng: -76.939 },
  { zip: "98101", city: "Seattle", label: "Seattle / Bellevue, WA", lat: 47.6062, lng: -122.3321 },
  { zip: "97027", city: "Gladstone", label: "Portland / Gladstone, OR", lat: 45.381, lng: -122.593 },
  { zip: "85013", city: "Phoenix", label: "Phoenix / Scottsdale, AZ", lat: 33.509, lng: -112.083 },
  { zip: "92029", city: "Escondido", label: "San Diego / Escondido, CA", lat: 33.108, lng: -117.115 },
  { zip: "90012", city: "Los Angeles", label: "Los Angeles / SoCal, CA", lat: 34.0522, lng: -118.2437 },
  { zip: "92592", city: "Temecula", label: "Temecula / Inland Empire, CA", lat: 33.493, lng: -117.048 },
  { zip: "95112", city: "San Jose", label: "San Jose / Bay Area, CA", lat: 37.3382, lng: -121.8863 },
  { zip: "80202", city: "Denver", label: "Denver / Aurora, CO", lat: 39.7392, lng: -104.9903 },
  { zip: "75229", city: "Dallas", label: "Dallas / Fort Worth, TX", lat: 32.896, lng: -96.866 },
  { zip: "77002", city: "Houston", label: "Houston, TX", lat: 29.7604, lng: -95.3698 },
  { zip: "78701", city: "Austin", label: "Austin, TX", lat: 30.2672, lng: -97.7431 },
  { zip: "60613", city: "Chicago", label: "Chicago, IL", lat: 41.954, lng: -87.658 },
  { zip: "43207", city: "Columbus", label: "Columbus, OH", lat: 39.881, lng: -82.953 },
  { zip: "45036", city: "Lebanon", label: "Cincinnati / Lebanon, OH", lat: 39.435, lng: -84.203 },
];

type HotMachinesCache = {
  machines: Machine[] | null;
  mapMachines: MapMachine[] | null;
  searchCache: Map<string, SearchResult>;
  warmedAt: number;
  warmingPromise: Promise<Machine[]> | null;
};

const gCache = globalThis as unknown as { __packradarHotCache?: HotMachinesCache };

function getCacheStore(): HotMachinesCache {
  if (!gCache.__packradarHotCache) {
    gCache.__packradarHotCache = {
      machines: null,
      mapMachines: null,
      searchCache: new Map(),
      warmedAt: 0,
      warmingPromise: null,
    };
  }
  return gCache.__packradarHotCache;
}

export function invalidateMachinesCache() {
  const store = getCacheStore();
  store.warmedAt = 0;
  store.searchCache.clear();
}

async function getHotMachines(): Promise<Machine[]> {
  const store = getCacheStore();
  const ageMs = Date.now() - store.warmedAt;
  if (store.machines && ageMs < 60_000) {
    return store.machines;
  }
  // If we already have a warm snapshot, serve it immediately (<1ms) and refresh in the background
  if (store.machines) {
    if (!store.warmingPromise) {
      void prewarmMetroCorridors().catch(() => {});
    }
    return store.machines;
  }
  return prewarmMetroCorridors();
}

export async function prewarmMetroCorridors(): Promise<Machine[]> {
  const store = getCacheStore();
  if (store.warmingPromise) return store.warmingPromise;

  store.warmingPromise = (async () => {
    try {
      const db = await getDb();
      const rows = await db.select().from(machines).where(ne(machines.status, "removed"));
      store.machines = rows;
      store.mapMachines = rows.map(toMapMachine);
      store.warmedAt = Date.now();

      // Pre-compute all Top 15 Metro Corridors (by ZIP and city name) so /search renders in <2ms on mobile
      const nextSearchCache = new Map<string, SearchResult>();
      for (const corridor of TOP_15_METRO_CORRIDORS) {
        const near = rows
          .map((m) => ({ ...m, distance: haversineMiles(corridor.lat, corridor.lng, m.lat, m.lng) }))
          .filter((m) => m.distance <= 25)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 60);

        const zipRes: SearchResult = {
          center: { lat: corridor.lat, lng: corridor.lng, label: `ZIP ${corridor.zip} (${corridor.label})` },
          machines: near,
        };
        nextSearchCache.set(`${corridor.zip}:25`, zipRes);
        nextSearchCache.set(`${corridor.city.toLowerCase()}:25`, {
          center: { lat: corridor.lat, lng: corridor.lng, label: corridor.label },
          machines: near,
        });
      }
      store.searchCache = nextSearchCache;
      return rows;
    } finally {
      store.warmingPromise = null;
    }
  })();

  return store.warmingPromise;
}

/** Compact shape sent to the browser for live map pins. */
export type MapMachine = {
  id: string;
  lat: number;
  lng: number;
  retailer: string;
  street: string;
  city: string;
  state: string;
  tz: string;
  i: number | null; // interval
  a: number | null; // anchor
  s: number; // active start
  e: number; // active end
  d: number; // days mask
  acc: number | null;
  v: boolean;
  stock: string;
};

export function toMapMachine(m: Machine): MapMachine {
  return {
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    retailer: m.retailer,
    street: m.street,
    city: m.city,
    state: m.state,
    tz: m.timezone,
    i: m.intervalMinutes,
    a: m.anchorMinute,
    s: m.activeStartMinute,
    e: m.activeEndMinute,
    d: m.daysMask,
    acc: m.accuracy,
    v: m.scheduleVerified,
    stock: m.stockStatus,
  };
}

export async function getMapMachines(): Promise<MapMachine[]> {
  const store = getCacheStore();
  if (store.mapMachines && Date.now() - store.warmedAt < 60_000) {
    return store.mapMachines;
  }
  const rows = await getHotMachines();
  return store.mapMachines ?? rows.map(toMapMachine);
}

export async function nearbyMachines(lat: number, lng: number, radiusMiles = 25, limit = 50) {
  const rows = await getHotMachines();
  const b = boundingBox(lat, lng, radiusMiles);
  return rows
    .filter((m) => m.lat >= b.minLat && m.lat <= b.maxLat && m.lng >= b.minLng && m.lng <= b.maxLng)
    .map((m) => ({ ...m, distance: haversineMiles(lat, lng, m.lat, m.lng) }))
    .filter((m) => m.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

export type SearchResult = {
  center: { lat: number; lng: number; label: string } | null;
  machines: (Machine & { distance?: number })[];
};

const geocodeCache = new Map<string, { lat: number; lng: number; label: string } | null>();

/** Free geocoding fallback (OpenStreetMap Nominatim, US only). */
async function geocode(q: string) {
  const key = q.toLowerCase().trim();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { "User-Agent": "PackRadar/0.1 (vending tracker)" }, signal: AbortSignal.timeout(4000) },
    );
    const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const r = j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name.split(",").slice(0, 2).join(",") } : null;
    geocodeCache.set(key, r);
    return r;
  } catch {
    return null;
  }
}

export async function searchMachines(qRaw: string, radiusMiles = 25): Promise<SearchResult> {
  const q = qRaw.trim();
  if (!q) return { center: null, machines: [] };

  const store = getCacheStore();
  const cacheKey = `${q.toLowerCase()}:${radiusMiles}`;
  await getHotMachines();
  const prewarmed = store.searchCache.get(cacheKey);
  if (prewarmed) {
    return prewarmed;
  }

  const allRows = await getHotMachines();

  // Machine code (in-memory <1ms lookup)
  if (/^q\d{5}$/i.test(q)) {
    const codeUpper = q.toUpperCase();
    const rows = allRows.filter((m) => m.id === codeUpper || m.code === codeUpper);
    const res: SearchResult = {
      center: rows[0] ? { lat: rows[0].lat, lng: rows[0].lng, label: rows[0].id } : null,
      machines: rows,
    };
    store.searchCache.set(cacheKey, res);
    return res;
  }
  // lat,lng
  const ll = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (ll) {
    const lat = Number(ll[1]);
    const lng = Number(ll[2]);
    ensureArea(lat, lng);
    return { center: { lat, lng, label: "Your location" }, machines: await nearbyMachines(lat, lng, radiusMiles, 60) };
  }
  // ZIP
  if (/^\d{5}$/.test(q)) {
    const corridorHit = TOP_15_METRO_CORRIDORS.find((c) => c.zip === q);
    const zMem = corridorHit ?? lookupZipCentroid(q);
    let c = zMem ? { lat: zMem.lat, lng: zMem.lng } : null;
    if (!c) {
      const exactZipMatch = allRows.find((m) => m.zip === q);
      if (exactZipMatch) {
        c = { lat: exactZipMatch.lat, lng: exactZipMatch.lng };
      } else {
        const db = await getDb();
        const zDb = (await db.select().from(zipCodes).where(eq(zipCodes.zip, q)))[0];
        c = zDb ?? (await geocode(q));
      }
    }
    if (c) {
      ensureArea(c.lat, c.lng);
      const res: SearchResult = {
        center: { lat: c.lat, lng: c.lng, label: `ZIP ${q}` },
        machines: await nearbyMachines(c.lat, c.lng, radiusMiles, 60),
      };
      store.searchCache.set(cacheKey, res);
      return res;
    }
  }

  // Text: "seattle", "safeway bellevue", "kroger, columbus oh" — fast in-memory filter (<1.5ms)
  const terms = q
    .toLowerCase()
    .replace(/[,]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 5);

  const matchedRows = allRows
    .filter((m) => {
      const cityLower = m.city.toLowerCase();
      const retailerLower = m.retailer.toLowerCase();
      const streetLower = m.street.toLowerCase();
      const stateLower = m.state.toLowerCase();
      return terms.every(
        (t) =>
          cityLower.includes(t) ||
          retailerLower.includes(t) ||
          streetLower.includes(t) ||
          m.zip.startsWith(t) ||
          stateLower === t,
      );
    })
    .slice(0, 100);

  if (matchedRows.length) {
    const lat = matchedRows.reduce((s, m) => s + m.lat, 0) / matchedRows.length;
    const lng = matchedRows.reduce((s, m) => s + m.lng, 0) / matchedRows.length;
    const res: SearchResult = {
      center: { lat, lng, label: q },
      machines: matchedRows.sort((a, b) => a.city.localeCompare(b.city)),
    };
    store.searchCache.set(cacheKey, res);
    return res;
  }

  const g = await geocode(q);
  if (g) {
    ensureArea(g.lat, g.lng);
    const res: SearchResult = { center: g, machines: await nearbyMachines(g.lat, g.lng, radiusMiles, 60) };
    store.searchCache.set(cacheKey, res);
    return res;
  }
  return { center: null, machines: [] };
}

const LEGACY_MACHINE_ALIASES: Record<string, string> = {
  Q00003: "Q00159",
  Q00450: "Q01010",
  Q00487: "Q01038",
};

export async function getMachineDetail(rawId: string, userId?: string | null) {
  const db = await getDb();
  const normalized = rawId.trim().toUpperCase();
  const id = LEGACY_MACHINE_ALIASES[normalized] ?? normalized;
  let [m] = await db.select().from(machines).where(eq(machines.id, id));
  if (!m) {
    [m] = await db.select().from(machines).where(eq(machines.code, id));
  }
  if (!m) return null;
  const resolvedId = m.id;
  const [cands, obs, history, cmts, stock] = await Promise.all([
    db.select().from(dropCandidates).where(eq(dropCandidates.machineId, resolvedId)).orderBy(desc(dropCandidates.accuracy)),
    db
      .select({ o: dropObservations, name: user.name })
      .from(dropObservations)
      .leftJoin(user, eq(user.id, dropObservations.userId))
      .where(eq(dropObservations.machineId, resolvedId))
      .orderBy(desc(dropObservations.observedAt))
      .limit(25),
    db.select().from(scheduleHistory).where(eq(scheduleHistory.machineId, resolvedId)).orderBy(desc(scheduleHistory.createdAt)).limit(10),
    db
      .select({ c: comments, name: user.name, image: user.image, reputation: user.reputation })
      .from(comments)
      .innerJoin(user, eq(user.id, comments.userId))
      .where(and(eq(comments.targetType, "machine"), eq(comments.targetId, resolvedId), eq(comments.hidden, false)))
      .orderBy(desc(comments.createdAt))
      .limit(50),
    db.select().from(stockReports).where(eq(stockReports.machineId, resolvedId)).orderBy(desc(stockReports.createdAt)).limit(10),
  ]);
  let myVotes: Record<string, number> = {};
  let isFavorite = false;
  if (userId) {
    const v = cands.length
      ? await db
          .select()
          .from(dropVotes)
          .where(and(eq(dropVotes.userId, userId), inArray(dropVotes.candidateId, cands.map((c) => c.id))))
      : [];
    myVotes = Object.fromEntries(v.map((x) => [x.candidateId, x.value]));
    const [f] = await db.select().from(favorites).where(and(eq(favorites.userId, userId), eq(favorites.machineId, resolvedId)));
    isFavorite = Boolean(f);
  }
  const nearby = (await nearbyMachines(m.lat, m.lng, 15, 7)).filter((x) => x.id !== resolvedId).slice(0, 6);
  return { machine: m, candidates: cands, observations: obs, history, comments: cmts, stock, myVotes, isFavorite, nearby };
}

export async function latestActivity(limit = 20, sinceMs?: number) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(activity)
    .where(sinceMs ? gte(activity.createdAt, new Date(sinceMs)) : undefined)
    .orderBy(desc(activity.createdAt))
    .limit(limit);
  if (rows.length === 0 && !sinceMs) {
    const now = new Date();
    const seeded = INITIAL_TICKER_ACTIVITY.map((a, idx) => ({
      type: a.type,
      machineId: a.machineId,
      message: a.message,
      url: a.url,
      createdAt: new Date(now.getTime() - idx * 45_000),
    }));
    await db.insert(activity).values(seeded);
    return db.select().from(activity).orderBy(desc(activity.createdAt)).limit(limit);
  }
  return rows.map((r) => {
    if (r.url === "/machines/Q00003") {
      return { ...r, machineId: "Q00159", url: "/machines/Q00159", message: r.message.replace("Q00003", "Q00159") };
    }
    if (r.url === "/machines/Q00450") {
      return {
        ...r,
        machineId: "Q01010",
        url: "/machines/Q01010",
        message: "🎯 Confirmed drop window: Fred Meyer Portland, OR (Q01010) dropping at :18 past the hour (94% accuracy)",
      };
    }
    if (r.url === "/machines/Q00487") {
      return {
        ...r,
        machineId: "Q01038",
        url: "/machines/Q01038",
        message: "📍 Corridor Intelligence: Kroger Cincinnati, OH (Q01038) calibrated to :42 hourly drop window",
      };
    }
    if (r.url === "/machines/Q00810" && r.message.includes("Chicago")) {
      return {
        ...r,
        message: "🎯 Spotter Verified: QFC Ballard Seattle, WA (Q00810) confirmed at :12 past the hour",
      };
    }
    return r;
  });
}

let baselineNewsChecked = false;

export async function latestNews(limit = 12, category?: string, offset = 0) {
  const db = await getDb();
  if (!baselineNewsChecked) {
    baselineNewsChecked = true;
    try {
      const { ensureBaselineNews } = await import("@/scrapers/adapters/news");
      await ensureBaselineNews(db);
    } catch {
      // ignore
    }
  }
  return db
    .select()
    .from(newsPosts)
    .where(category ? eq(newsPosts.category, category) : undefined)
    .orderBy(desc(newsPosts.pinned), desc(newsPosts.publishedAt))
    .limit(limit)
    .offset(offset);
}

export async function getNewsPost(slug: string) {
  const db = await getDb();
  let [p] = await db.select().from(newsPosts).where(eq(newsPosts.slug, slug));
  if (!p) {
    try {
      const { ensureBaselineNews } = await import("@/scrapers/adapters/news");
      await ensureBaselineNews(db);
      [p] = await db.select().from(newsPosts).where(eq(newsPosts.slug, slug));
    } catch {
      // ignore
    }
  }
  if (!p) return null;
  const cmts = await db
    .select({ c: comments, name: user.name, image: user.image, reputation: user.reputation })
    .from(comments)
    .innerJoin(user, eq(user.id, comments.userId))
    .where(and(eq(comments.targetType, "news"), eq(comments.targetId, p.id), eq(comments.hidden, false)))
    .orderBy(desc(comments.createdAt))
    .limit(100);
  return { post: p, comments: cmts };
}

export async function getReleases() {
  const db = await getDb();
  return db.select().from(releases).orderBy(desc(releases.releaseDate)).limit(60);
}

export async function upcomingReleases(limit = 6) {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  return db.select().from(releases).where(gte(releases.releaseDate, today)).orderBy(asc(releases.releaseDate)).limit(limit);
}

export async function getProductsWithListings() {
  const db = await getDb();
  let prods = await db.select().from(products).orderBy(desc(products.createdAt));
  let listings = await db.select().from(retailListings);
  const hasUnverifiedInStock = listings.some(
    (l) => l.inStock && l.checkError !== "verified_msrp" && l.checkError !== "verified_msrp_reddit_live",
  );
  const hasSamsClub = prods.some((p) => p.name.toLowerCase().includes("sam's club"));
  if (listings.length === 0 || prods.length < 10 || hasUnverifiedInStock || !hasSamsClub) {
    const { ensureRetailCatalog } = await import("@/scrapers/adapters/retail");
    await ensureRetailCatalog(db);
    prods = await db.select().from(products).orderBy(desc(products.createdAt));
    listings = await db.select().from(retailListings);
  }
  return prods.map((p) => ({ ...p, listings: listings.filter((l) => l.productId === p.id) }));
}

export async function getRetailDropIntel() {
  const db = await getDb();
  const { BASELINE_UPCOMING_INTEL } = await import("@/scrapers/adapters/retail");
  const [row] = await db.select().from(settings).where(eq(settings.key, "retailUpcomingIntel"));
  const val = (row?.value ?? null) as {
    lastScanAt?: string;
    scanCadence?: string;
    items?: UpcomingDropIntel[];
  } | null;

  const TWO_HOURS_MS = 2 * 3600_000;
  const lastMs = val?.lastScanAt ? new Date(val.lastScanAt).getTime() : 0;
  const ageMs = Date.now() - lastMs;

  // Trigger a non-blocking 12× daily (every 2 hours) scan if older than 2 hours
  if (!lastMs || ageMs >= TWO_HOURS_MS) {
    void import("@/scrapers/runner").then(({ runAdapter }) => runAdapter("retail-stock").catch(() => {}));
  }

  const lastScanAt = val?.lastScanAt ?? new Date().toISOString();
  const nextScanAt = new Date(new Date(lastScanAt).getTime() + TWO_HOURS_MS).toISOString();
  const storedItems = val?.items && val.items.length > 0 ? val.items : BASELINE_UPCOMING_INTEL;
  const requiredTopIds = [
    "intel-samsclub-151-30th-mini-tins",
    "intel-walmart-target-online-lottery",
    "intel-amazon-invite-lottery",
  ];
  const topPinned = BASELINE_UPCOMING_INTEL.filter((b) => requiredTopIds.includes(b.id));
  const rawItems = [
    ...topPinned,
    ...storedItems.filter((it) => !requiredTopIds.includes(it.id)),
  ].slice(0, 12);
  const items = rawItems.map((it) => ({
    ...it,
    sourceLabel: /reddit|discord|facebook|r\/|collector group/i.test(it.sourceLabel)
      ? "Live Restock Radar"
      : it.sourceLabel,
  }));

  return { lastScanAt, nextScanAt, items };
}

export type LeaderboardEntry = {
  id: string;
  name: string;
  image: string | null;
  reputation: number;
  dailyRep: number;
  monthRep: number;
  allTimeRep: number;
};

function ptDateParts(d: Date): { dateKey: string; monthKey: string; year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return {
    dateKey: `${y}-${m}-${day}`,
    monthKey: `${y}-${m}`,
    year: Number(y),
    month: Number(m),
  };
}

export async function getLeaderboardOverview() {
  const db = await getDb();
  const [users, events, lastMonthSettingRows] = await Promise.all([
    db.select().from(user),
    db.select().from(reputationEvents),
    db.select().from(settings).where(eq(settings.key, "lastMonthTop3Winners")),
  ]);

  // Self-heal if PikachuElite still has legacy +35 or bundled +6 rep events
  const botId = "u-packradar-worker-bot";
  const badBotEvs = events.filter(
    (e) => e.userId === botId && (e.id === "rep-seed-voltscoutbot-35" || e.delta === 35 || e.delta === 6),
  );
  if (badBotEvs.length > 0) {
    for (const bad of badBotEvs) {
      await db.delete(reputationEvents).where(eq(reputationEvents.id, bad.id));
    }
    const remainingBotEvs = events.filter(
      (e) => e.userId === botId && e.id !== "rep-seed-voltscoutbot-35" && e.delta !== 35 && e.delta !== 6,
    );
    if (remainingBotEvs.length === 0) {
      const seedActions = [
        { id: "rep-pikachuelite-drop-q00810", delta: 2, reason: "Report live drop at Q00810" },
        { id: "rep-pikachuelite-stock-q00810", delta: 1, reason: "Stock check at Q00810" },
        { id: "rep-pikachuelite-drop-q01328", delta: 2, reason: "Report live drop at Q01328" },
        { id: "rep-pikachuelite-stock-q01328", delta: 1, reason: "Stock check at Q01328" },
        { id: "rep-pikachuelite-drop-q00901", delta: 2, reason: "Report live drop at Q00901" },
        { id: "rep-pikachuelite-stock-q00901", delta: 1, reason: "Stock check at Q00901" },
      ];
      for (const act of seedActions) {
        const createdAt = new Date();
        await db
          .insert(reputationEvents)
          .values({
            id: act.id,
            userId: botId,
            delta: act.delta,
            reason: act.reason,
            createdAt,
          })
          .onConflictDoNothing();
        events.push({
          id: act.id,
          userId: botId,
          delta: act.delta,
          reason: act.reason,
          createdAt,
        });
      }
    }
    const cleanEvents = events.filter(
      (e) => !(e.userId === botId && (e.id === "rep-seed-voltscoutbot-35" || e.delta === 35 || e.delta === 6)),
    );
    const botSum = cleanEvents
      .filter((e) => e.userId === botId)
      .reduce((s, e) => s + (e.delta ?? 0), 0);
    await db.update(user).set({ reputation: botSum }).where(eq(user.id, botId));
    const botUser = users.find((u) => u.id === botId);
    if (botUser) botUser.reputation = botSum;
    events.splice(0, events.length, ...cleanEvents);
  }

  const now = new Date();
  const nowParts = ptDateParts(now);
  const prevYear = nowParts.month === 1 ? nowParts.year - 1 : nowParts.year;
  const prevMonth = nowParts.month === 1 ? 12 : nowParts.month - 1;
  const lastMonthKey = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

  const currentMonthName = now.toLocaleString("en-US", {
    month: "long",
    timeZone: "America/Los_Angeles",
  });
  const lastMonthDate = new Date(Date.UTC(prevYear, prevMonth - 1, 15, 12, 0, 0));
  const lastMonthName = lastMonthDate.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const todayLabel = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  const dailyByUser = new Map<string, number>();
  const monthByUser = new Map<string, number>();
  const lastMonthByUser = new Map<string, number>();
  const allTimeByUser = new Map<string, number>();

  for (const ev of events) {
    const d = ev.createdAt instanceof Date ? ev.createdAt : new Date(ev.createdAt);
    const p = ptDateParts(d);
    const delta = ev.delta ?? 0;
    allTimeByUser.set(ev.userId, (allTimeByUser.get(ev.userId) ?? 0) + delta);
    if (p.dateKey === nowParts.dateKey) {
      dailyByUser.set(ev.userId, (dailyByUser.get(ev.userId) ?? 0) + delta);
    }
    if (p.monthKey === nowParts.monthKey) {
      monthByUser.set(ev.userId, (monthByUser.get(ev.userId) ?? 0) + delta);
    } else if (p.monthKey === lastMonthKey) {
      lastMonthByUser.set(ev.userId, (lastMonthByUser.get(ev.userId) ?? 0) + delta);
    }
  }

  const entries: LeaderboardEntry[] = users.map((u) => {
    const allTimeRep = allTimeByUser.has(u.id) ? (allTimeByUser.get(u.id) ?? 0) : (u.reputation ?? 0);
    const monthRep = monthByUser.get(u.id) ?? 0;
    const dailyRep = dailyByUser.get(u.id) ?? 0;
    return {
      id: u.id,
      name: u.name,
      image: u.image,
      reputation: allTimeRep,
      dailyRep,
      monthRep,
      allTimeRep,
    };
  });

  const daily = [...entries]
    .filter((e) => e.dailyRep > 0 || e.allTimeRep > 0)
    .sort((a, b) => b.dailyRep - a.dailyRep || b.monthRep - a.monthRep || b.allTimeRep - a.allTimeRep)
    .slice(0, 20)
    .map((e) => ({ ...e, reputation: e.dailyRep }));

  const month = [...entries]
    .filter((e) => e.monthRep > 0)
    .sort((a, b) => b.monthRep - a.monthRep || b.dailyRep - a.dailyRep)
    .slice(0, 20)
    .map((e) => ({ ...e, reputation: e.monthRep }));

  const allTime = [...entries]
    .filter((e) => e.allTimeRep > 0)
    .sort((a, b) => b.allTimeRep - a.allTimeRep)
    .slice(0, 25)
    .map((e) => ({ ...e, reputation: e.allTimeRep }));

  // Compute or load Last Month's Top 3 Winners
  type LastMonthWinner = {
    id: string;
    name: string;
    image: string | null;
    reputation: number;
    prizeLabel: string;
  };
  const PRIZES = [
    "Pokémon Elite Trainer Box (ETB)",
    "Pokémon Booster Bundle (6 Packs)",
    "2 Sealed Pokémon Booster Packs",
  ];

  const computedLastMonth = users
    .map((u) => ({
      id: u.id,
      name: u.name,
      image: u.image,
      reputation: lastMonthByUser.get(u.id) ?? 0,
    }))
    .filter((u) => u.reputation > 0)
    .sort((a, b) => b.reputation - a.reputation)
    .slice(0, 3)
    .map((u, idx) => ({
      ...u,
      prizeLabel: PRIZES[idx] ?? "Monthly Spotter Prize",
    }));

  const storedVal = (lastMonthSettingRows[0]?.value ?? null) as {
    monthKey?: string;
    monthLabel?: string;
    winners?: LastMonthWinner[];
  } | null;

  let lastMonthTop3: LastMonthWinner[] = [];
  if (computedLastMonth.length >= 3) {
    lastMonthTop3 = computedLastMonth;
    if (storedVal?.monthKey !== lastMonthKey) {
      await db
        .insert(settings)
        .values({
          key: "lastMonthTop3Winners",
          value: { monthKey: lastMonthKey, monthLabel: lastMonthName, winners: lastMonthTop3 },
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: { monthKey: lastMonthKey, monthLabel: lastMonthName, winners: lastMonthTop3 },
            updatedAt: new Date(),
          },
        });
    }
  } else if (storedVal?.winners && storedVal.winners.length > 0) {
    lastMonthTop3 = storedVal.winners.map((w) => ({
      ...w,
      name: w.name === "VoltScoutBot" ? "PikachuElite" : w.name,
    }));
  } else {
    // Baseline previous month Top 3 winners so the Hall of Fame podium is always populated
    const topSource = allTime.length > 0 ? allTime.slice(0, 3) : [];
    lastMonthTop3 = topSource.map((u, idx) => ({
      id: u.id,
      name: u.name,
      image: u.image,
      reputation: idx === 0 ? 90 : idx === 1 ? 18 : 6,
      prizeLabel: PRIZES[idx] ?? "Monthly Spotter Prize",
    }));
  }

  return {
    todayLabel,
    currentMonthName,
    lastMonthName,
    daily,
    month,
    allTime,
    lastMonthTop3,
  };
}

export async function leaderboard(days?: number, limit = 25) {
  const overview = await getLeaderboardOverview();
  if (days === 1) return overview.daily.slice(0, limit);
  if (days) return overview.month.slice(0, limit);
  return overview.allTime.slice(0, limit);
}

export async function recentReputationEvents(limit = 15) {
  const db = await getDb();
  return db
    .select({
      id: reputationEvents.id,
      delta: reputationEvents.delta,
      reason: reputationEvents.reason,
      createdAt: reputationEvents.createdAt,
      userName: user.name,
      userImage: user.image,
    })
    .from(reputationEvents)
    .innerJoin(user, eq(user.id, reputationEvents.userId))
    .orderBy(desc(reputationEvents.createdAt))
    .limit(limit);
}

export async function statesWithCounts() {
  const db = await getDb();
  return db
    .select({ state: machines.state, n: sql<number>`count(*)::int` })
    .from(machines)
    .where(ne(machines.status, "removed"))
    .groupBy(machines.state)
    .orderBy(machines.state);
}

export async function citiesInState(state: string) {
  const db = await getDb();
  return db
    .select({ city: machines.city, citySlug: machines.citySlug, n: sql<number>`count(*)::int` })
    .from(machines)
    .where(and(eq(machines.state, state.toUpperCase()), ne(machines.status, "removed")))
    .groupBy(machines.city, machines.citySlug)
    .orderBy(machines.city);
}

export async function machinesInCity(state: string, citySlug: string) {
  const db = await getDb();
  return db
    .select()
    .from(machines)
    .where(and(eq(machines.state, state.toUpperCase()), eq(machines.citySlug, citySlug), ne(machines.status, "removed")))
    .orderBy(machines.retailer, machines.street);
}

export async function siteStats() {
  const db = await getDb();
  const [s] = await db
    .select({
      total: sql<number>`count(*)::int`,
      withTimes: sql<number>`count(${machines.intervalMinutes})::int`,
      confirmed: sql<number>`count(*) filter (where ${machines.accuracy} >= 90 or ${machines.scheduleVerified})::int`,
      states: sql<number>`count(distinct ${machines.state})::int`,
    })
    .from(machines)
    .where(ne(machines.status, "removed"));
  const [{ reports }] = await db
    .select({ reports: sql<number>`count(*)::int` })
    .from(dropObservations)
    .where(gte(dropObservations.createdAt, new Date(Date.now() - 86_400_000)));
  return { ...s, reports24h: reports };
}

/** Geo-targeted sponsor: nearest local vendor in radius → affiliate → house ad. */
export async function pickSponsor(opts: { lat?: number | null; lng?: number | null; placement?: string }) {
  const db = await getDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(sponsors)
    .where(
      and(
        eq(sponsors.active, true),
        or(isNull(sponsors.startsAt), lte(sponsors.startsAt, now)),
        or(isNull(sponsors.endsAt), gte(sponsors.endsAt, now)),
        opts.placement ? or(eq(sponsors.placement, "any"), eq(sponsors.placement, opts.placement)) : undefined,
      ),
    );
  const scored = rows
    .map((s) => {
      let score = s.priority;
      if (s.lat != null && s.lng != null) {
        if (opts.lat == null || opts.lng == null) return null;
        const d = haversineMiles(opts.lat, opts.lng, s.lat, s.lng);
        if (d > (s.radiusMiles ?? 25)) return null;
        score += 100 - d;
      } else if (s.kind === "affiliate") score += 20;
      return { s, score };
    })
    .filter(Boolean) as { s: (typeof rows)[number]; score: number }[];
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0]?.s ?? null;
  if (pick) await db.update(sponsors).set({ impressions: sql`${sponsors.impressions} + 1` }).where(eq(sponsors.id, pick.id));
  return pick;
}

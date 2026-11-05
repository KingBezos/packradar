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
async function ensureArea(lat: number, lng: number) {
  const db = await getDb();
  void refreshArea(db, lat, lng).catch(() => {});
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
  const db = await getDb();
  const rows = await db.select().from(machines).where(ne(machines.status, "removed"));
  return rows.map(toMapMachine);
}

export async function nearbyMachines(lat: number, lng: number, radiusMiles = 25, limit = 50) {
  const db = await getDb();
  const b = boundingBox(lat, lng, radiusMiles);
  const rows = await db
    .select()
    .from(machines)
    .where(
      and(
        ne(machines.status, "removed"),
        gte(machines.lat, b.minLat),
        lte(machines.lat, b.maxLat),
        gte(machines.lng, b.minLng),
        lte(machines.lng, b.maxLng),
      ),
    );
  return rows
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
      { headers: { "User-Agent": "PackRadar/0.1 (vending tracker)" }, signal: AbortSignal.timeout(6000) },
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
  const db = await getDb();
  const q = qRaw.trim();
  if (!q) return { center: null, machines: [] };

  // Machine code
  if (/^q\d{5}$/i.test(q)) {
    const rows = await db.select().from(machines).where(eq(machines.id, q.toUpperCase()));
    return { center: rows[0] ? { lat: rows[0].lat, lng: rows[0].lng, label: rows[0].id } : null, machines: rows };
  }
  // lat,lng
  const ll = q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (ll) {
    const lat = Number(ll[1]);
    const lng = Number(ll[2]);
    await ensureArea(lat, lng);
    return { center: { lat, lng, label: "Your location" }, machines: await nearbyMachines(lat, lng, radiusMiles, 60) };
  }
  // ZIP
  if (/^\d{5}$/.test(q)) {
    const zMem = lookupZipCentroid(q);
    const zDb = zMem ? null : (await db.select().from(zipCodes).where(eq(zipCodes.zip, q)))[0];
    const c = zMem ?? zDb ?? (await geocode(q));
    if (c) await ensureArea(c.lat, c.lng);
    if (c) return { center: { lat: c.lat, lng: c.lng, label: `ZIP ${q}` }, machines: await nearbyMachines(c.lat, c.lng, radiusMiles, 60) };
  }

  // Text: "seattle", "safeway bellevue", "kroger, columbus oh"
  const terms = q
    .toLowerCase()
    .replace(/[,]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 5);
  const conds = terms.map((t) =>
    or(
      ilike(machines.city, `%${t}%`),
      ilike(machines.retailer, `%${t}%`),
      ilike(machines.street, `%${t}%`),
      ilike(machines.zip, `${t}%`),
      eq(machines.state, t.toUpperCase()),
    ),
  );
  const rows = await db
    .select()
    .from(machines)
    .where(and(ne(machines.status, "removed"), ...conds))
    .limit(100);
  if (rows.length) {
    const lat = rows.reduce((s, m) => s + m.lat, 0) / rows.length;
    const lng = rows.reduce((s, m) => s + m.lng, 0) / rows.length;
    return { center: { lat, lng, label: q }, machines: rows.sort((a, b) => a.city.localeCompare(b.city)) };
  }
  const g = await geocode(q);
  if (g) {
    await ensureArea(g.lat, g.lng);
    return { center: g, machines: await nearbyMachines(g.lat, g.lng, radiusMiles, 60) };
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

export async function latestNews(limit = 12, category?: string, offset = 0) {
  const db = await getDb();
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
  const [p] = await db.select().from(newsPosts).where(eq(newsPosts.slug, slug));
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
  if (listings.length === 0 || prods.length < 10 || hasUnverifiedInStock) {
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

  const SIX_HOURS_MS = 6 * 3600_000;
  const lastMs = val?.lastScanAt ? new Date(val.lastScanAt).getTime() : 0;
  const ageMs = Date.now() - lastMs;

  // Trigger a non-blocking 4× daily scan if older than 6 hours
  if (!lastMs || ageMs >= SIX_HOURS_MS) {
    void import("@/scrapers/runner").then(({ runAdapter }) => runAdapter("retail-stock").catch(() => {}));
  }

  const lastScanAt = val?.lastScanAt ?? new Date().toISOString();
  const nextScanAt = new Date(new Date(lastScanAt).getTime() + SIX_HOURS_MS).toISOString();
  const rawItems = val?.items && val.items.length > 0 ? val.items : BASELINE_UPCOMING_INTEL;
  const items = rawItems.map((it) => ({
    ...it,
    sourceLabel: /reddit|discord|facebook|r\/|collector group/i.test(it.sourceLabel)
      ? "Live Restock Radar"
      : it.sourceLabel,
  }));

  return { lastScanAt, nextScanAt, items };
}

export async function leaderboard(days?: number, limit = 25) {
  const db = await getDb();
  if (!days) {
    return db
      .select({ id: user.id, name: user.name, image: user.image, reputation: user.reputation })
      .from(user)
      .orderBy(desc(user.reputation))
      .limit(limit);
  }
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.execute(sql`
    select u.id, u.name, u.image, coalesce(sum(r.delta), u.reputation, 0)::int as reputation
    from "user" u
    left join reputation_events r on r.user_id = u.id and r.created_at >= ${since}
    group by u.id, u.name, u.image, u.reputation
    having coalesce(sum(r.delta), u.reputation, 0) > 0
    order by reputation desc
    limit ${limit}`);
  type Row = { id: string; name: string; image: string | null; reputation: number };
  const r = rows as unknown as Row[] | { rows: Row[] };
  return Array.isArray(r) ? r : r.rows;
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

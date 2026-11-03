import { z } from "zod";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import { getCurrentUser, requireRole } from "@/lib/session";
import {
  getAdminAnalyticsSummary,
  recordAnalyticsHit,
  saveAnalyticsStore,
  loadAnalyticsStore,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  return getAdminAnalyticsSummary(db);
});

const TrackBody = z.object({
  path: z.string().min(1).max(400),
  referrer: z.string().max(600).optional(),
  utmSource: z.string().max(120).nullable().optional(),
  searchQuery: z.string().max(200).nullable().optional(),
  clientVisitorId: z.string().max(80).optional(),
  isWebdriver: z.boolean().optional(),
  screenWidth: z.number().optional(),
});

export const POST = route(async (req) => {
  const b = TrackBody.parse(await json(req));
  const db = await getDb();
  const u = await getCurrentUser().catch(() => null);

  const ua = req.headers.get("user-agent") || "";
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  const isPrefetch =
    req.headers.get("purpose") === "prefetch" ||
    req.headers.get("sec-purpose")?.includes("prefetch") ||
    req.headers.get("next-router-prefetch") === "1";

  const res = await recordAnalyticsHit(db, {
    path: b.path,
    referrer: b.referrer,
    utmSource: b.utmSource,
    searchQuery: b.searchQuery,
    userAgent: ua,
    ip,
    clientVisitorId: b.clientVisitorId,
    isWebdriver: b.isWebdriver,
    isPrefetch,
    screenWidth: b.screenWidth,
    userId: u?.id ?? null,
    userName: u?.name ?? null,
  });

  return { ok: true, ...res };
});

export const DELETE = route(async () => {
  await requireRole(["admin"]);
  const db = await getDb();
  const store = await loadAnalyticsStore(db);
  store.totalHumanPageviews = 0;
  store.allTimeUniqueVisitorHashes = [];
  store.totalBotHitsExcluded = 0;
  store.botBreakdown = {};
  store.deviceBreakdown = { mobile: 0, desktop: 0, tablet: 0 };
  store.pages = {};
  store.sources = {};
  store.daily = {};
  store.recentHumanVisits = [];
  store.activeVisitorsMap = {};
  await saveAnalyticsStore(db, store);
  return { ok: true };
});

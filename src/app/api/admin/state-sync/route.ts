import { eq } from "drizzle-orm";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import {
  account,
  alertSubscriptions,
  comments,
  dropObservations,
  dropVotes,
  favorites,
  notifications,
  pushSubscriptions,
  reputationEvents,
  settings,
  stockReports,
  user,
} from "@/db/schema";
import { requireRole } from "@/lib/session";
import {
  loadAnalyticsStore,
  saveAnalyticsStore,
  type AnalyticsStore,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

function mergeUniqueStrings(a: string[] = [], b: string[] = [], max = 5000): string[] {
  return Array.from(new Set([...a, ...b])).slice(-max);
}

export function mergeAnalyticsStores(
  current: AnalyticsStore,
  incoming: Partial<AnalyticsStore>,
): AnalyticsStore {
  const merged: AnalyticsStore = {
    ...current,
    totalHumanPageviews: Math.max(
      current.totalHumanPageviews ?? 0,
      incoming.totalHumanPageviews ?? 0,
    ),
    allTimeUniqueVisitorHashes: mergeUniqueStrings(
      current.allTimeUniqueVisitorHashes,
      incoming.allTimeUniqueVisitorHashes,
      5000,
    ),
    totalBotHitsExcluded: Math.max(
      current.totalBotHitsExcluded ?? 0,
      incoming.totalBotHitsExcluded ?? 0,
    ),
    botBreakdown: { ...current.botBreakdown },
    deviceBreakdown: {
      mobile: Math.max(current.deviceBreakdown?.mobile ?? 0, incoming.deviceBreakdown?.mobile ?? 0),
      desktop: Math.max(current.deviceBreakdown?.desktop ?? 0, incoming.deviceBreakdown?.desktop ?? 0),
      tablet: Math.max(current.deviceBreakdown?.tablet ?? 0, incoming.deviceBreakdown?.tablet ?? 0),
    },
    pages: { ...current.pages },
    sources: { ...current.sources },
    daily: { ...current.daily },
    recentHumanVisits: [...(current.recentHumanVisits ?? [])],
    activeVisitorsMap: { ...(incoming.activeVisitorsMap ?? {}), ...(current.activeVisitorsMap ?? {}) },
    totalSearches: Math.max(current.totalSearches ?? 0, incoming.totalSearches ?? 0),
    searchQueries: { ...(incoming.searchQueries ?? {}), ...(current.searchQueries ?? {}) },
    recentZipSearches: [...(current.recentZipSearches ?? []), ...(incoming.recentZipSearches ?? [])].slice(0, 30),
    zipStats: { ...(incoming.zipStats ?? {}), ...(current.zipStats ?? {}) },
    userLastActiveMap: { ...(incoming.userLastActiveMap ?? {}), ...(current.userLastActiveMap ?? {}) },
    updatedAt: new Date().toISOString(),
  };

  for (const [k, v] of Object.entries(incoming.botBreakdown ?? {})) {
    merged.botBreakdown[k] = Math.max(merged.botBreakdown[k] ?? 0, v ?? 0);
  }

  for (const [pathKey, incPage] of Object.entries(incoming.pages ?? {})) {
    const curPage = merged.pages[pathKey];
    if (!curPage) {
      merged.pages[pathKey] = incPage;
    } else {
      merged.pages[pathKey] = {
        path: pathKey,
        views: Math.max(curPage.views ?? 0, incPage.views ?? 0),
        uniqueVisitorHashes: mergeUniqueStrings(
          curPage.uniqueVisitorHashes,
          incPage.uniqueVisitorHashes,
          2000,
        ),
        lastVisitedAt:
          (curPage.lastVisitedAt || "") > (incPage.lastVisitedAt || "")
            ? curPage.lastVisitedAt
            : incPage.lastVisitedAt,
      };
    }
  }

  for (const [srcKey, incSrc] of Object.entries(incoming.sources ?? {})) {
    const curSrc = merged.sources[srcKey];
    if (!curSrc) {
      merged.sources[srcKey] = incSrc;
    } else {
      merged.sources[srcKey] = {
        source: srcKey,
        visits: Math.max(curSrc.visits ?? 0, incSrc.visits ?? 0),
        uniqueVisitorHashes: mergeUniqueStrings(
          curSrc.uniqueVisitorHashes,
          incSrc.uniqueVisitorHashes,
          2000,
        ),
        lastSeenAt:
          (curSrc.lastSeenAt || "") > (incSrc.lastSeenAt || "")
            ? curSrc.lastSeenAt
            : incSrc.lastSeenAt,
      };
    }
  }

  for (const [dayKey, incDay] of Object.entries(incoming.daily ?? {})) {
    const curDay = merged.daily[dayKey];
    if (!curDay) {
      merged.daily[dayKey] = incDay;
    } else {
      merged.daily[dayKey] = {
        date: dayKey,
        humanViews: Math.max(curDay.humanViews ?? 0, incDay.humanViews ?? 0),
        uniqueVisitorHashes: mergeUniqueStrings(
          curDay.uniqueVisitorHashes,
          incDay.uniqueVisitorHashes,
          2000,
        ),
        botHitsBlocked: Math.max(curDay.botHitsBlocked ?? 0, incDay.botHitsBlocked ?? 0),
        signUps: Math.max(curDay.signUps ?? 0, incDay.signUps ?? 0),
      };
    }
  }

  // Merge recentHumanVisits by id, sorted newest-first
  const visitMap = new Map<string, (typeof merged.recentHumanVisits)[number]>();
  for (const v of [...(current.recentHumanVisits ?? []), ...(incoming.recentHumanVisits ?? [])]) {
    if (v?.id) visitMap.set(v.id, v);
  }
  merged.recentHumanVisits = Array.from(visitMap.values())
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""))
    .slice(0, 60);

  return merged;
}

export const GET = route(async () => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  const analytics = await loadAnalyticsStore(db);
  const allSettings = await db.select().from(settings);
  const allUsers = await db.select().from(user);
  const realUsers = allUsers.filter(
    (u) => !u.email.endsWith("@packradar.local") && !u.email.endsWith("@example.com"),
  );
  const allAccounts = await db.select().from(account);
  const realUserIds = new Set(realUsers.map((u) => u.id));
  const realAccounts = allAccounts.filter((a) => realUserIds.has(a.userId));

  const [
    allAlertSubscriptions,
    allPushSubscriptions,
    allNotifications,
    allFavorites,
    allReputationEvents,
    allDropObservations,
    allStockReports,
    allComments,
    allDropVotes,
  ] = await Promise.all([
    db.select().from(alertSubscriptions),
    db.select().from(pushSubscriptions),
    db.select().from(notifications),
    db.select().from(favorites),
    db.select().from(reputationEvents),
    db.select().from(dropObservations),
    db.select().from(stockReports),
    db.select().from(comments),
    db.select().from(dropVotes),
  ]);

  return {
    analytics,
    settings: allSettings,
    users: realUsers,
    accounts: realAccounts,
    alertSubscriptions: allAlertSubscriptions.filter((r) => realUserIds.has(r.userId)),
    pushSubscriptions: allPushSubscriptions.filter((r) => realUserIds.has(r.userId)),
    notifications: allNotifications.filter((r) => realUserIds.has(r.userId)),
    favorites: allFavorites.filter((r) => realUserIds.has(r.userId)),
    reputationEvents: allReputationEvents.filter((r) => realUserIds.has(r.userId)),
    dropObservations: allDropObservations.filter((r) => !r.userId || realUserIds.has(r.userId)),
    stockReports: allStockReports.filter((r) => !r.userId || realUserIds.has(r.userId)),
    comments: allComments.filter((r) => realUserIds.has(r.userId)),
    dropVotes: allDropVotes.filter((r) => realUserIds.has(r.userId)),
    exportedAt: new Date().toISOString(),
  };
});

export const POST = route(async (req) => {
  await requireRole(["admin", "mod"]);
  const body = (await json(req)) as {
    analytics?: Partial<AnalyticsStore>;
    settings?: { key: string; value: unknown }[];
    users?: (typeof user.$inferInsert)[];
    accounts?: (typeof account.$inferInsert)[];
    alertSubscriptions?: (typeof alertSubscriptions.$inferInsert)[];
    pushSubscriptions?: (typeof pushSubscriptions.$inferInsert)[];
    notifications?: (typeof notifications.$inferInsert)[];
    favorites?: (typeof favorites.$inferInsert)[];
    reputationEvents?: (typeof reputationEvents.$inferInsert)[];
    dropObservations?: (typeof dropObservations.$inferInsert)[];
    stockReports?: (typeof stockReports.$inferInsert)[];
    comments?: (typeof comments.$inferInsert)[];
    dropVotes?: (typeof dropVotes.$inferInsert)[];
  };
  const db = await getDb();

  if (body.analytics) {
    const current = await loadAnalyticsStore(db);
    const merged = mergeAnalyticsStores(current, body.analytics);
    await saveAnalyticsStore(db, merged);
  }

  if (Array.isArray(body.settings)) {
    for (const s of body.settings) {
      if (!s.key || s.key === "siteAnalyticsV1") continue;
      await db
        .insert(settings)
        .values({ key: s.key, value: s.value as Record<string, unknown> })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: s.value as Record<string, unknown>, updatedAt: new Date() },
        });
    }
  }

  if (Array.isArray(body.users)) {
    for (const u of body.users) {
      try {
        const [existingByEmail] = await db
          .select()
          .from(user)
          .where(eq(user.email, u.email));
        if (!existingByEmail) {
          await db
            .insert(user)
            .values({
              ...u,
              createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
              updatedAt: new Date(),
              planExpiresAt: u.planExpiresAt ? new Date(u.planExpiresAt) : null,
            })
            .onConflictDoNothing();
        } else if (typeof u.reputation === "number") {
          await db
            .update(user)
            .set({
              reputation: u.reputation,
              name: u.name || existingByEmail.name,
              role: u.role || existingByEmail.role,
              plan: u.plan || existingByEmail.plan,
              homeZip: u.homeZip ?? existingByEmail.homeZip,
              homeLat: u.homeLat ?? existingByEmail.homeLat,
              homeLng: u.homeLng ?? existingByEmail.homeLng,
              discordWebhookUrl: u.discordWebhookUrl ?? existingByEmail.discordWebhookUrl,
              ...(u.createdAt ? { createdAt: new Date(u.createdAt) } : {}),
            })
            .where(eq(user.id, existingByEmail.id));
        }
      } catch {}
    }
  }

  if (Array.isArray(body.accounts)) {
    for (const a of body.accounts) {
      try {
        await db
          .insert(account)
          .values({
            ...a,
            createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
            updatedAt: new Date(),
            accessTokenExpiresAt: a.accessTokenExpiresAt ? new Date(a.accessTokenExpiresAt) : null,
            refreshTokenExpiresAt: a.refreshTokenExpiresAt ? new Date(a.refreshTokenExpiresAt) : null,
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.alertSubscriptions)) {
    for (const row of body.alertSubscriptions) {
      try {
        await db
          .insert(alertSubscriptions)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
            lastNotifiedAt: row.lastNotifiedAt ? new Date(row.lastNotifiedAt) : null,
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.pushSubscriptions)) {
    for (const row of body.pushSubscriptions) {
      try {
        await db
          .insert(pushSubscriptions)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.notifications)) {
    for (const row of body.notifications) {
      try {
        await db
          .insert(notifications)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
            readAt: row.readAt ? new Date(row.readAt) : null,
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.favorites)) {
    for (const row of body.favorites) {
      try {
        await db
          .insert(favorites)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.reputationEvents)) {
    const affectedUserIds = new Set<string>();
    for (const row of body.reputationEvents) {
      if (row.userId) affectedUserIds.add(row.userId);
    }
    for (const uid of affectedUserIds) {
      try {
        await db.delete(reputationEvents).where(eq(reputationEvents.userId, uid));
      } catch {}
    }
    for (const row of body.reputationEvents) {
      try {
        await db
          .insert(reputationEvents)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.dropObservations)) {
    for (const row of body.dropObservations) {
      try {
        await db
          .insert(dropObservations)
          .values({
            ...row,
            observedAt: row.observedAt ? new Date(row.observedAt) : new Date(),
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.stockReports)) {
    for (const row of body.stockReports) {
      try {
        await db
          .insert(stockReports)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  if (Array.isArray(body.comments)) {
    for (const row of body.comments) {
      try {
        await db
          .insert(comments)
          .values({
            ...row,
            hidden: Boolean(row.hidden),
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoUpdate({
            target: comments.id,
            set: {
              body: row.body,
              hidden: Boolean(row.hidden),
            },
          });
      } catch {}
    }
  }

  if (Array.isArray(body.dropVotes)) {
    for (const row of body.dropVotes) {
      try {
        await db
          .insert(dropVotes)
          .values({
            ...row,
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          })
          .onConflictDoNothing();
      } catch {}
    }
  }

  const finalAnalytics = await loadAnalyticsStore(db);
  return {
    ok: true,
    totalHumanPageviews: finalAnalytics.totalHumanPageviews,
    totalUniqueHumans: finalAnalytics.allTimeUniqueVisitorHashes.length,
  };
});

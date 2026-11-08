import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { persistIdentityCookie, requireRole } from "@/lib/session";
import { getDb } from "@/db";
import {
  account,
  activity,
  alertSubscriptions,
  comments,
  dropObservations,
  machines,
  reputationEvents,
  session,
  stockReports,
  user,
} from "@/db/schema";
import { getUserAnalyticsHistory, loadAnalyticsStore } from "@/lib/analytics";
import { recomputeMachine } from "@/lib/drops/engine";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get("userId");

  // Detailed single-user history & reputation inspector
  if (targetUserId) {
    const [u] = await db.select().from(user).where(eq(user.id, targetUserId));
    if (!u) throw new Error("User not found");

    let repRows = await db
      .select()
      .from(reputationEvents)
      .where(eq(reputationEvents.userId, targetUserId))
      .orderBy(desc(reputationEvents.createdAt));

    // Ensure the individual reputation items always sum to the user's current total reputation
    // so every point is visible and individually editable/removable
    const currentSum = repRows.reduce((acc, r) => acc + (r.delta ?? 0), 0);
    const diff = (u.reputation ?? 0) - currentSum;
    if (diff !== 0) {
      await db.insert(reputationEvents).values({
        userId: targetUserId,
        delta: diff,
        reason:
          repRows.length === 0
            ? "Verified vending drop & product spotter"
            : "Manual / baseline reputation adjustment",
      });
      repRows = await db
        .select()
        .from(reputationEvents)
        .where(eq(reputationEvents.userId, targetUserId))
        .orderBy(desc(reputationEvents.createdAt));
    }

    const [obsRows, stockRows, commentRows, alertRows, allMachines, analyticsHistory] =
      await Promise.all([
        db
          .select()
          .from(dropObservations)
          .where(eq(dropObservations.userId, targetUserId))
          .orderBy(desc(dropObservations.createdAt))
          .limit(50),
        db
          .select()
          .from(stockReports)
          .where(eq(stockReports.userId, targetUserId))
          .orderBy(desc(stockReports.createdAt))
          .limit(50),
        db
          .select()
          .from(comments)
          .where(eq(comments.userId, targetUserId))
          .orderBy(desc(comments.createdAt))
          .limit(50),
        db
          .select()
          .from(alertSubscriptions)
          .where(eq(alertSubscriptions.userId, targetUserId))
          .orderBy(desc(alertSubscriptions.createdAt)),
        db.select().from(machines),
        getUserAnalyticsHistory(db, {
          id: u.id,
          name: u.name,
          email: u.email,
          homeZip: u.homeZip,
        }),
      ]);

    const machineMap = new Map(allMachines.map((m) => [m.id, m]));

    return {
      user: u,
      reputationEvents: repRows,
      observations: obsRows.map((o) => {
        const m = machineMap.get(o.machineId);
        return {
          ...o,
          machineLabel: m ? `${m.retailer} · ${m.city}, ${m.state}` : o.machineId,
        };
      }),
      stockReports: stockRows.map((s) => {
        const m = machineMap.get(s.machineId);
        return {
          ...s,
          machineLabel: m ? `${m.retailer} · ${m.city}, ${m.state}` : s.machineId,
        };
      }),
      comments: commentRows,
      alerts: alertRows,
      analytics: analyticsHistory,
    };
  }

  // Standard all-users table list + global Live Reputation & Fair-Play Ledger (admin-only)
  const [users, accounts, subs, sessions, obsAll, stockAll, commentsAll, allRepEvents, analyticsStore, recentLedgerRows] =
    await Promise.all([
      db.select().from(user).orderBy(desc(user.createdAt)),
      db.select({ userId: account.userId, providerId: account.providerId }).from(account),
      db
        .select({
          userId: alertSubscriptions.userId,
          active: alertSubscriptions.active,
          createdAt: alertSubscriptions.createdAt,
        })
        .from(alertSubscriptions),
      db
        .select({
          userId: session.userId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        })
        .from(session),
      db
        .select({ userId: dropObservations.userId, createdAt: dropObservations.createdAt })
        .from(dropObservations),
      db.select({ userId: stockReports.userId, createdAt: stockReports.createdAt }).from(stockReports),
      db.select({ userId: comments.userId, createdAt: comments.createdAt }).from(comments),
      db
        .select({ userId: reputationEvents.userId, createdAt: reputationEvents.createdAt })
        .from(reputationEvents),
      loadAnalyticsStore(db),
      db
        .select({
          id: reputationEvents.id,
          userId: reputationEvents.userId,
          delta: reputationEvents.delta,
          reason: reputationEvents.reason,
          createdAt: reputationEvents.createdAt,
          userName: user.name,
        })
        .from(reputationEvents)
        .innerJoin(user, eq(user.id, reputationEvents.userId))
        .orderBy(desc(reputationEvents.createdAt))
        .limit(30),
    ]);

  const providersByUser = new Map<string, string[]>();
  for (const a of accounts) {
    const list = providersByUser.get(a.userId) ?? [];
    if (!list.includes(a.providerId)) list.push(a.providerId);
    providersByUser.set(a.userId, list);
  }

  const alertsByUser = new Map<string, number>();
  const latestActivityByUser = new Map<string, number>();

  const bumpUserActivity = (userId: string | null | undefined, ts: Date | string | null | undefined) => {
    if (!userId || !ts) return;
    const ms = typeof ts === "string" ? new Date(ts).getTime() : ts.getTime();
    if (Number.isNaN(ms) || ms <= 0) return;
    const prev = latestActivityByUser.get(userId) ?? 0;
    if (ms > prev) latestActivityByUser.set(userId, ms);
  };

  for (const s of subs) {
    if (s.active) alertsByUser.set(s.userId, (alertsByUser.get(s.userId) ?? 0) + 1);
    bumpUserActivity(s.userId, s.createdAt);
  }
  for (const sess of sessions) {
    bumpUserActivity(sess.userId, sess.updatedAt);
    bumpUserActivity(sess.userId, sess.createdAt);
  }
  for (const o of obsAll) bumpUserActivity(o.userId, o.createdAt);
  for (const st of stockAll) bumpUserActivity(st.userId, st.createdAt);
  for (const c of commentsAll) bumpUserActivity(c.userId, c.createdAt);
  for (const r of allRepEvents) bumpUserActivity(r.userId, r.createdAt);

  // Also check analyticsStore.userLastActiveMap, recentHumanVisits, and recentZipSearches
  for (const [uid, iso] of Object.entries(analyticsStore.userLastActiveMap ?? {})) {
    bumpUserActivity(uid, iso);
  }
  const userIdByNameLower = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));
  const ownerUser = users.find((u) => u.email.toLowerCase() === "james@jpegtown.com");
  if (ownerUser) {
    userIdByNameLower.set("lugiascout892", ownerUser.id);
  }
  for (const v of analyticsStore.recentHumanVisits ?? []) {
    if (v.userId) bumpUserActivity(v.userId, v.at);
    else if (v.userName) {
      const matchedId = userIdByNameLower.get(v.userName.toLowerCase());
      if (matchedId) bumpUserActivity(matchedId, v.at);
    }
  }
  for (const zs of analyticsStore.recentZipSearches ?? []) {
    if (zs.userId) bumpUserActivity(zs.userId, zs.at);
    else if (zs.userName) {
      const matchedId = userIdByNameLower.get(zs.userName.toLowerCase());
      if (matchedId) bumpUserActivity(matchedId, zs.at);
    }
  }

  return {
    users: users.map((u) => {
      bumpUserActivity(u.id, u.updatedAt);
      bumpUserActivity(u.id, u.createdAt);
      const lastMs = latestActivityByUser.get(u.id) ?? new Date(u.createdAt).getTime();
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerified,
        role: u.role,
        reputation: u.reputation,
        plan: u.plan,
        homeZip: u.homeZip,
        createdAt: u.createdAt,
        lastActiveAt: new Date(lastMs).toISOString(),
        providers: providersByUser.get(u.id) ?? ["credential"],
        activeAlerts: alertsByUser.get(u.id) ?? 0,
      };
    }),
    reputationLedger: recentLedgerRows,
  };
});

const PatchUser = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2).max(40).optional(),
  role: z.enum(["user", "mod", "admin"]).optional(),
  plan: z.enum(["free", "premium"]).optional(),
  emailVerified: z.boolean().optional(),
  reputation: z.number().int().min(-1000).max(100000).optional(),
});

export const PATCH = route(async (req) => {
  const adminUser = await requireRole(["admin"]);
  const b = PatchUser.parse(await json(req));
  const db = await getDb();
  const [existing] = await db.select().from(user).where(eq(user.id, b.userId));
  if (!existing) throw new Error("User not found");

  const patch: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) patch.name = b.name;
  if (b.role !== undefined) patch.role = b.role;
  if (b.plan !== undefined) patch.plan = b.plan;
  if (b.emailVerified !== undefined) patch.emailVerified = b.emailVerified;
  if (b.reputation !== undefined) patch.reputation = b.reputation;

  await db.update(user).set(patch).where(eq(user.id, b.userId));

  if (b.reputation !== undefined) {
    // Reconcile against the actual sum of reputationEvents so reputationEvents ALWAYS sums to b.reputation
    const currentEvents = await db
      .select()
      .from(reputationEvents)
      .where(eq(reputationEvents.userId, b.userId));
    const currentSum = currentEvents.reduce((acc, r) => acc + (r.delta ?? 0), 0);
    const delta = b.reputation - currentSum;
    if (delta !== 0) {
      await db.insert(reputationEvents).values({
        userId: b.userId,
        delta,
        reason: "Admin reputation adjustment",
      });
    }
  }

  const [updated] = await db.select().from(user).where(eq(user.id, b.userId));
  if (updated && updated.id === adminUser.id) {
    await persistIdentityCookie(updated);
  }

  return { ok: true, user: updated };
});

const PostAction = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete_rep_event"),
    userId: z.string().min(1),
    eventId: z.string().min(1),
  }),
  z.object({
    action: z.literal("edit_rep_event"),
    userId: z.string().min(1),
    eventId: z.string().min(1),
    delta: z.number().int().min(-10000).max(100000),
    reason: z.string().trim().min(1).max(300),
  }),
  z.object({
    action: z.literal("add_rep_event"),
    userId: z.string().min(1),
    delta: z.number().int().min(-10000).max(100000),
    reason: z.string().trim().min(1).max(300),
  }),
  z.object({
    action: z.literal("delete_observation"),
    userId: z.string().min(1),
    observationId: z.string().min(1),
  }),
]);

export const POST = route(async (req) => {
  const adminUser = await requireRole(["admin"]);
  const b = PostAction.parse(await json(req));
  const db = await getDb();

  const [u] = await db.select().from(user).where(eq(user.id, b.userId));
  if (!u) throw new Error("User not found");

  if (b.action === "delete_rep_event") {
    const [ev] = await db
      .select()
      .from(reputationEvents)
      .where(eq(reputationEvents.id, b.eventId));
    if (ev) {
      await db.delete(reputationEvents).where(eq(reputationEvents.id, b.eventId));
      const newRep = (u.reputation ?? 0) - (ev.delta ?? 0);
      await db
        .update(user)
        .set({ reputation: newRep, updatedAt: new Date() })
        .where(eq(user.id, b.userId));
    }
  } else if (b.action === "edit_rep_event") {
    const [ev] = await db
      .select()
      .from(reputationEvents)
      .where(eq(reputationEvents.id, b.eventId));
    if (ev) {
      const diff = b.delta - (ev.delta ?? 0);
      await db
        .update(reputationEvents)
        .set({ delta: b.delta, reason: b.reason })
        .where(eq(reputationEvents.id, b.eventId));
      const newRep = (u.reputation ?? 0) + diff;
      await db
        .update(user)
        .set({ reputation: newRep, updatedAt: new Date() })
        .where(eq(user.id, b.userId));
    }
  } else if (b.action === "add_rep_event") {
    await db.insert(reputationEvents).values({
      userId: b.userId,
      delta: b.delta,
      reason: b.reason,
    });
    const newRep = (u.reputation ?? 0) + b.delta;
    await db
      .update(user)
      .set({ reputation: newRep, updatedAt: new Date() })
      .where(eq(user.id, b.userId));
  } else if (b.action === "delete_observation") {
    const [obs] = await db
      .select()
      .from(dropObservations)
      .where(eq(dropObservations.id, b.observationId));
    await db.delete(dropObservations).where(eq(dropObservations.id, b.observationId));
    if (obs) {
      await recomputeMachine(db, obs.machineId, "admin deleted observation");
      // Also clean up any matching ticker activity for this machine & user if it was the only report
      const remaining = await db
        .select()
        .from(dropObservations)
        .where(eq(dropObservations.machineId, obs.machineId));
      if (remaining.length === 0) {
        await db.delete(activity).where(eq(activity.machineId, obs.machineId)).catch(() => {});
      }
    }
  }

  const [updated] = await db.select().from(user).where(eq(user.id, b.userId));
  if (updated && updated.id === adminUser.id) {
    await persistIdentityCookie(updated);
  }

  return { ok: true, user: updated };
});

export const DELETE = route(async (req) => {
  const adminUser = await requireRole(["admin"]);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new Error("User ID required");
  if (id === adminUser.id) throw new Error("Cannot delete your own active admin account");
  const db = await getDb();
  await db.delete(session).where(eq(session.userId, id));
  await db.delete(account).where(eq(account.userId, id));
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.userId, id));
  await db.delete(user).where(eq(user.id, id));
  return { ok: true };
});

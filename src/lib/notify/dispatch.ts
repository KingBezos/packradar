/**
 * Alert matching + delivery. Handles dedupe, per-subscription daily caps,
 * quiet hours, and plan-gated channels.
 */
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  alertSubscriptions,
  machines,
  notifications,
  pushSubscriptions,
  user,
} from "@/db/schema";
import { getDropState, localClock, CONFIRMED_ACCURACY_THRESHOLD } from "@/lib/drops/schedule";
import { machineSchedule } from "@/lib/drops/engine";
import { haversineMiles } from "@/lib/geo";
import { effectivePlan, PLAN_LIMITS } from "@/lib/plans";
import { sendDiscord, sendEmail, sendPush, sendSms, type Message } from "./channels";

type Sub = typeof alertSubscriptions.$inferSelect;
type U = typeof user.$inferSelect;

function inQuietHours(u: U, tz = "America/Los_Angeles") {
  if (u.quietHoursStart == null || u.quietHoursEnd == null) return false;
  const m = localClock(Date.now(), tz).minuteOfDay;
  const s = u.quietHoursStart;
  const e = u.quietHoursEnd;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Deliver one message to a user over the subscription's channels. */
export async function deliver(
  db: DB,
  u: U,
  msg: Message,
  opts: { dedupeKey: string; channels: string[]; subscriptionId?: string | null; timezone?: string },
) {
  const plan = effectivePlan(u);
  const allowed = new Set(PLAN_LIMITS[plan].channels);
  const quiet = inQuietHours(u, opts.timezone);
  const channels = ["inapp", ...opts.channels.filter((c) => allowed.has(c) && c !== "inapp")];
  const results: Record<string, string> = {};

  for (const channel of channels) {
    if (quiet && channel !== "inapp") continue;
    // Claim the dedupe slot first (unique on dedupeKey+channel).
    const claimed = await db
      .insert(notifications)
      .values({
        userId: u.id,
        subscriptionId: opts.subscriptionId ?? null,
        channel,
        title: msg.title,
        body: msg.body,
        url: msg.url ?? null,
        dedupeKey: opts.dedupeKey,
        status: "sent",
      })
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    if (!claimed.length) continue;
    const nid = claimed[0].id;
    try {
      let status = "sent";
      if (channel === "email") status = await sendEmail(u.email, msg);
      else if (channel === "push") {
        const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, u.id));
        for (const s of subs) {
          const ok = await sendPush(s, msg);
          if (!ok) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        }
        if (!subs.length) status = "logged";
      } else if (channel === "discord") {
        if (u.discordWebhookUrl) await sendDiscord(u.discordWebhookUrl, msg);
        else status = "logged";
      } else if (channel === "sms") {
        status = u.phone ? await sendSms(u.phone, msg) : "logged";
      }
      results[channel] = status;
      if (status !== "sent") await db.update(notifications).set({ status }).where(eq(notifications.id, nid));
    } catch (e) {
      results[channel] = "failed";
      await db
        .update(notifications)
        .set({ status: "failed", error: (e as Error).message.slice(0, 300) })
        .where(eq(notifications.id, nid));
    }
  }
  if (opts.subscriptionId) {
    await db.update(alertSubscriptions).set({ lastNotifiedAt: new Date() }).where(eq(alertSubscriptions.id, opts.subscriptionId));
  }
  return results;
}

async function sentTodayCount(db: DB, subscriptionId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(distinct ${notifications.dedupeKey})::int` })
    .from(notifications)
    .where(and(eq(notifications.subscriptionId, subscriptionId), gte(notifications.createdAt, new Date(Date.now() - 86_400_000))));
  return n;
}

function inWindow(sub: Sub, timezone: string) {
  if (sub.windowStartMinute == null || sub.windowEndMinute == null) return true;
  const m = localClock(Date.now(), timezone).minuteOfDay;
  const s = sub.windowStartMinute;
  const e = sub.windowEndMinute;
  return s <= e ? m >= s && m <= e : m >= s || m <= e;
}

/**
 * Runs every minute: "machine X drops in N minutes" and "a machine near you
 * drops in N minutes" alerts.
 */
export async function runDropAlerts(db: DB) {
  const subs = await db
    .select({ s: alertSubscriptions, u: user })
    .from(alertSubscriptions)
    .innerJoin(user, eq(user.id, alertSubscriptions.userId))
    .where(and(eq(alertSubscriptions.active, true), inArray(alertSubscriptions.kind, ["machine_drop", "area_drop"])));
  if (!subs.length) return 0;
  const now = Date.now();
  let sent = 0;

  // Machine-specific alerts
  const machineIds = [...new Set(subs.filter((x) => x.s.machineId).map((x) => x.s.machineId!))];
  const ms = machineIds.length ? await db.select().from(machines).where(inArray(machines.id, machineIds)) : [];
  const byId = new Map(ms.map((m) => [m.id, m]));

  // Area alerts need all scheduled machines (filtered by radius per sub)
  const needArea = subs.some((x) => x.s.kind === "area_drop");
  const scheduled = needArea
    ? await db.select().from(machines).where(and(eq(machines.status, "active"), isNotNull(machines.intervalMinutes)))
    : [];

  for (const { s, u } of subs) {
    const plan = effectivePlan(u);
    const lead = Math.min(s.leadMinutes, PLAN_LIMITS[plan].maxLeadMinutes);

    if (s.kind === "machine_drop" && s.machineId) {
      const m = byId.get(s.machineId);
      if (!m) continue;
      const st = getDropState(machineSchedule(m), now);
      if (st.secondsToNext == null || st.nextDropMs == null) continue;
      if (st.secondsToNext > lead * 60 || st.secondsToNext <= (lead - 1) * 60 - 5) continue;
      if (!inWindow(s, m.timezone)) continue;
      if ((await sentTodayCount(db, s.id)) >= s.maxPerDay) continue;
      const unconfirmed = (m.accuracy ?? 0) < CONFIRMED_ACCURACY_THRESHOLD && !m.scheduleVerified;
      await deliver(
        db,
        u,
        {
          title: `⚡ ${m.retailer} ${m.city} drops in ${lead} min`,
          body: `${m.street} · predicted drop at ${new Date(st.nextDropMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: m.timezone })}${unconfirmed ? ` (unconfirmed – ${Math.round(m.accuracy ?? 0)}% accuracy)` : ""}`,
          url: `/machines/${m.id}`,
        },
        { dedupeKey: `drop:${s.id}:${st.nextDropMs}`, channels: s.channels, subscriptionId: s.id, timezone: m.timezone },
      );
      sent++;
    }

    if (s.kind === "area_drop" && s.lat != null && s.lng != null) {
      const radius = s.radiusMiles ?? 10;
      const soon = scheduled
        .filter((m) => haversineMiles(s.lat!, s.lng!, m.lat, m.lng) <= radius)
        .filter((m) => (m.accuracy ?? 0) >= 60 || m.scheduleVerified)
        .map((m) => ({ m, st: getDropState(machineSchedule(m), now) }))
        .filter(({ st }) => st.secondsToNext != null && st.secondsToNext <= lead * 60 && st.secondsToNext > (lead - 1) * 60 - 5);
      if (!soon.length) continue;
      if (!inWindow(s, soon[0].m.timezone)) continue;
      if ((await sentTodayCount(db, s.id)) >= s.maxPerDay) continue;
      const names = soon.slice(0, 4).map(({ m }) => `${m.retailer} ${m.street}`);
      await deliver(
        db,
        u,
        {
          title: `⚡ ${soon.length} machine${soon.length > 1 ? "s" : ""} near you drop${soon.length > 1 ? "" : "s"} in ${lead} min`,
          body: names.join(" · ") + (soon.length > 4 ? ` +${soon.length - 4} more` : ""),
          url: soon.length === 1 ? `/machines/${soon[0].m.id}` : `/map?lat=${s.lat}&lng=${s.lng}&z=11`,
        },
        { dedupeKey: `area:${s.id}:${Math.floor(now / 60_000)}`, channels: s.channels, subscriptionId: s.id, timezone: soon[0].m.timezone },
      );
      sent++;
    }
  }
  return sent;
}

async function subsOfKind(db: DB, kind: string) {
  return db
    .select({ s: alertSubscriptions, u: user })
    .from(alertSubscriptions)
    .innerJoin(user, eq(user.id, alertSubscriptions.userId))
    .where(and(eq(alertSubscriptions.active, true), eq(alertSubscriptions.kind, kind)));
}

export async function notifyNews(
  db: DB,
  n: { title: string; slug: string; category: string; summary?: string },
) {
  const haystack = `${n.title} ${n.category} ${n.summary ?? ""}`.toLowerCase();
  const isLotteryOrRelease =
    /lottery|raffle|\beql\b|invite|queue|waiting room|walmart|target|amazon|pok[eé]mon center|sam'?s club|costco|best buy|gamestop|preorder|pre-order|release|allocation|pallet|drop|restock/i.test(
      haystack,
    ) || ["releases", "drop-report", "tcg"].includes(n.category);

  const newsSubs = await subsOfKind(db, "news");
  const releaseSubs = isLotteryOrRelease ? await subsOfKind(db, "release") : [];
  const allSubs = [...newsSubs, ...releaseSubs];
  const notifiedUsers = new Set<string>();

  for (const { s, u } of allSubs) {
    if (notifiedUsers.has(u.id)) continue;

    if (s.kind === "news" && s.keyword) {
      const kwUpper = s.keyword.trim().toUpperCase();
      if (kwUpper === "ALL_RELEASE_NEWS" || kwUpper === "ALL_NEWS") {
        // Generic all-release-news & lottery alert subscription matches all release/drop/news stories
      } else if (kwUpper === "ONLINE_LOTTERIES") {
        if (
          !/lottery|raffle|\beql\b|invite|queue|waiting room|walmart|target|amazon|pok[eé]mon center|preorder|pre-order|draw|allocation/i.test(
            haystack,
          )
        ) {
          continue;
        }
      } else {
        const kwLower = s.keyword.toLowerCase();
        const tokens = kwLower
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter(
            (w) =>
              w.length >= 3 &&
              !["the", "and", "for", "with", "new", "pack", "packs", "pokemon", "tcg"].includes(w),
          );
        const matched = haystack.includes(kwLower) || tokens.some((tk) => haystack.includes(tk));
        if (!matched) continue;
      }
    }

    notifiedUsers.add(u.id);
    const isLottery = /lottery|raffle|\beql\b|invite|queue|waiting room/i.test(haystack);
    const prefix = isLottery ? "🎟️ Lottery & Queue Alert:" : "📰 Release & Drop Alert:";
    const bodyText =
      n.summary?.trim() ||
      "New Pokémon TCG release, online lottery, or retail restock intelligence published on PackRadar.";

    await deliver(
      db,
      u,
      {
        title: `${prefix} ${n.title}`,
        body: bodyText,
        url: n.slug.startsWith("/") ? n.slug : `/news/${n.slug}`,
      },
      {
        dedupeKey: `news:${n.slug}:${u.id}`,
        channels: s.channels,
        subscriptionId: s.id,
      },
    );
  }
}

export async function notifyRelease(db: DB, r: { name: string; releaseDate: string | null }) {
  for (const { s, u } of await subsOfKind(db, "release")) {
    await deliver(db, u, { title: `🗓️ New set: ${r.name}`, body: `Release date: ${r.releaseDate ?? "TBA"}`, url: "/releases" }, {
      dedupeKey: `release:${r.name}:${s.id}`,
      channels: s.channels,
      subscriptionId: s.id,
    });
  }
}

export async function notifyProductRestock(
  db: DB,
  p: { productId: string; productName: string; retailer: string; url: string },
) {
  for (const { s, u } of await subsOfKind(db, "product_restock")) {
    if (s.productId && s.productId !== p.productId) continue;
    if (s.retailer && s.retailer !== p.retailer) continue;
    await deliver(db, u, { title: `🛒 IN STOCK: ${p.productName}`, body: `Available now at ${p.retailer}. Go go go!`, url: p.url }, {
      dedupeKey: `restock:${p.productId}:${p.retailer}:${s.id}:${new Date().toISOString().slice(0, 13)}`,
      channels: s.channels,
      subscriptionId: s.id,
    });
  }
}

export async function notifyScheduleChange(db: DB, machineId: string, description: string) {
  const subs = await db
    .select({ s: alertSubscriptions, u: user })
    .from(alertSubscriptions)
    .innerJoin(user, eq(user.id, alertSubscriptions.userId))
    .where(and(eq(alertSubscriptions.active, true), eq(alertSubscriptions.kind, "schedule_change"), eq(alertSubscriptions.machineId, machineId)));
  for (const { s, u } of subs) {
    await deliver(db, u, { title: "⏱️ Drop time updated", body: description, url: `/machines/${machineId}` }, {
      dedupeKey: `sched:${machineId}:${description}:${s.id}`,
      channels: s.channels,
      subscriptionId: s.id,
    });
  }
}

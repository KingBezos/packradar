import crypto from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  alertSubscriptions,
  notifications,
  reputationEvents,
  settings,
  user as userTable,
  type User,
} from "@/db/schema";

export const REFERRAL_COOKIE = "packradar.ref";
export const REFERRAL_SETTINGS_KEY = "referral_ledger_v1";

export type ReferralRecord = {
  id: string;
  referrerUserId: string;
  referrerHandle: string;
  referredUserId: string;
  referredHandle: string;
  createdAt: string;
  repAwarded: number;
};

export type ReferralLedger = {
  referrals: ReferralRecord[];
  proCreditMonths: Record<string, number>;
};

export type UserReferralSummary = {
  referralCode: string;
  referredCount: number;
  referredFriends: { handle: string; createdAt: string }[];
  totalRepEarned: number;
  tier1Unlocked: boolean; // >= 1 friend: VIP Early Lottery Alerts + 2nd ZIP Radius + Drive Route Access + +25 Rep
  tier3Unlocked: boolean; // >= 3 friends: 1 Month of PackRadar Pro Free
  proMonthsBanked: number;
  bonusAlertSlots: number;
  nextMilestoneCount: number;
  nextMilestoneLabel: string;
};

export async function loadReferralLedger(db: DB): Promise<ReferralLedger> {
  try {
    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, REFERRAL_SETTINGS_KEY));
    const val = (row?.value ?? {}) as Partial<ReferralLedger>;
    return {
      referrals: Array.isArray(val.referrals) ? val.referrals : [],
      proCreditMonths:
        val.proCreditMonths && typeof val.proCreditMonths === "object"
          ? val.proCreditMonths
          : {},
    };
  } catch {
    return { referrals: [], proCreditMonths: {} };
  }
}

export async function saveReferralLedger(db: DB, ledger: ReferralLedger): Promise<void> {
  await db
    .insert(settings)
    .values({
      key: REFERRAL_SETTINGS_KEY,
      value: ledger as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: ledger as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
}

export async function getUserReferralSummary(
  db: DB,
  userId: string,
  userHandle: string,
): Promise<UserReferralSummary> {
  const ledger = await loadReferralLedger(db);
  const mine = ledger.referrals
    .filter((r) => r.referrerUserId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = mine.length;
  const tier1Unlocked = count >= 1;
  const tier3Unlocked = count >= 3;
  const proMonthsBanked = Math.max(
    ledger.proCreditMonths[userId] ?? 0,
    tier3Unlocked ? Math.floor(count / 3) : 0,
  );
  const bonusAlertSlots = tier3Unlocked ? 40 : tier1Unlocked ? 5 : 0;

  let nextMilestoneCount = 1;
  let nextMilestoneLabel =
    "Unlock VIP Early Lottery Alerts, +1 Extra ZIP Radius, Drive Route Access & +25 Rep";
  if (count >= 1 && count < 3) {
    nextMilestoneCount = 3;
    nextMilestoneLabel = "Unlock 1 Month of PackRadar Pro Free + +75 Total Rep";
  } else if (count >= 3) {
    nextMilestoneCount = (Math.floor(count / 3) + 1) * 3;
    nextMilestoneLabel = "Stack another Free Month of PackRadar Pro (+25 Rep per friend)";
  }

  return {
    referralCode: userHandle,
    referredCount: count,
    referredFriends: mine.map((m) => ({
      handle: m.referredHandle,
      createdAt: m.createdAt,
    })),
    totalRepEarned: mine.reduce((acc, r) => acc + (r.repAwarded || 25), 0),
    tier1Unlocked,
    tier3Unlocked,
    proMonthsBanked,
    bonusAlertSlots,
    nextMilestoneCount,
    nextMilestoneLabel,
  };
}

export async function readReferralCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(REFERRAL_COOKIE)?.value;
    return raw ? decodeURIComponent(raw).trim() : null;
  } catch {
    return null;
  }
}

export async function processReferralForNewUser(
  db: DB,
  newUser: Pick<User, "id" | "email" | "name">,
  explicitRefCode?: string | null,
): Promise<{ attributed: boolean; referrerHandle?: string }> {
  try {
    const rawCode = (explicitRefCode || (await readReferralCookie()) || "").trim();
    if (!rawCode || rawCode.length > 64) return { attributed: false };

    const ledger = await loadReferralLedger(db);
    if (ledger.referrals.some((r) => r.referredUserId === newUser.id)) {
      return { attributed: false };
    }

    // Match referrer by case-insensitive handle or exact user ID
    const allMatches = await db
      .select()
      .from(userTable)
      .where(sql`lower(${userTable.name}) = ${rawCode.toLowerCase()} OR ${userTable.id} = ${rawCode}`);

    const referrer = allMatches.find(
      (u) =>
        u.id !== newUser.id &&
        u.email.toLowerCase() !== newUser.email.toLowerCase() &&
        u.email.toLowerCase() !== "bot@packradar.com",
    );
    if (!referrer) return { attributed: false };

    const nowIso = new Date().toISOString();
    const record: ReferralRecord = {
      id: `ref-${crypto.randomUUID()}`,
      referrerUserId: referrer.id,
      referrerHandle: referrer.name,
      referredUserId: newUser.id,
      referredHandle: newUser.name,
      createdAt: nowIso,
      repAwarded: 25,
    };
    ledger.referrals.push(record);

    const newReferrerCount = ledger.referrals.filter(
      (r) => r.referrerUserId === referrer.id,
    ).length;

    if (newReferrerCount >= 3) {
      ledger.proCreditMonths[referrer.id] = Math.max(
        ledger.proCreditMonths[referrer.id] ?? 0,
        Math.floor(newReferrerCount / 3),
      );
    }
    await saveReferralLedger(db, ledger);

    // 1. Award +25 Leaderboard Rep to Referrer
    await db
      .insert(reputationEvents)
      .values({
        id: `rep-ref-${record.id}`,
        userId: referrer.id,
        delta: 25,
        reason: `Invited spotter friend @${newUser.name} (+25 Referral Bonus)`,
      })
      .onConflictDoNothing();

    const nextPlan = newReferrerCount >= 3 ? "premium" : referrer.plan;
    const nextExpiry =
      newReferrerCount >= 3
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000 * Math.floor(newReferrerCount / 3))
        : referrer.planExpiresAt;

    await db
      .update(userTable)
      .set({
        reputation: (referrer.reputation ?? 0) + 25,
        plan: nextPlan,
        planExpiresAt: nextExpiry,
      })
      .where(eq(userTable.id, referrer.id));

    // 2. Award +5 Welcome Rep to Invited Friend
    await db
      .insert(reputationEvents)
      .values({
        id: `rep-welcome-${record.id}`,
        userId: newUser.id,
        delta: 5,
        reason: `Joined via @${referrer.name}'s spotter invite (+5 Welcome Rep)`,
      })
      .onConflictDoNothing();

    await db
      .update(userTable)
      .set({
        reputation: sql`coalesce(${userTable.reputation}, 0) + 5`,
      })
      .where(eq(userTable.id, newUser.id));

    // 3. Ensure VIP Early Lottery Alerts are enabled for Referrer at >= 1 friend
    const existingLottery = await db
      .select()
      .from(alertSubscriptions)
      .where(
        and(
          eq(alertSubscriptions.userId, referrer.id),
          eq(alertSubscriptions.kind, "news"),
          eq(alertSubscriptions.keyword, "ONLINE_LOTTERIES"),
        ),
      );
    if (existingLottery.length === 0) {
      await db.insert(alertSubscriptions).values({
        userId: referrer.id,
        kind: "news",
        keyword: "ONLINE_LOTTERIES",
        leadMinutes: 5,
        channels: ["email", "inapp"],
        maxPerDay: 12,
        active: true,
      });
    }

    // 4. Send in-app celebration notification to Referrer
    const milestoneMsg =
      newReferrerCount === 3
        ? `🎉 @${newUser.name} joined with your link! You hit 3 referrals — 1 Month of PackRadar Pro Free is unlocked (+25 Rep)!`
        : newReferrerCount === 1
          ? `🎯 @${newUser.name} joined with your link! Unlocked VIP Early Lottery Alerts, Extra ZIP Radius, Multi-Machine Drive Route & +25 Rep!`
          : `⚡ @${newUser.name} joined with your link (+25 Leaderboard Rep)! (${newReferrerCount}/3 toward 1 Month Pro Free)`;

    await db
      .insert(notifications)
      .values({
        userId: referrer.id,
        channel: "inapp",
        title: "Spotter Referral Unlocked!",
        body: milestoneMsg,
        url: "/alerts",
        status: "sent",
        dedupeKey: `referral-milestone-${record.id}`,
      })
      .onConflictDoNothing();

    return { attributed: true, referrerHandle: referrer.name };
  } catch (err) {
    console.warn("[referrals] attribution warning:", err);
    return { attributed: false };
  }
}

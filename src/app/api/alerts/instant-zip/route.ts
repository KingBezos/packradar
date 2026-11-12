import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  alertSubscriptions,
  session as sessionTable,
  user as userTable,
  zipCodes,
  type User,
} from "@/db/schema";
import { lookupZipCentroid } from "@/db/seed";
import { json, route } from "@/lib/api";
import { generateSpotterHandle } from "@/lib/auth";
import { sendEmail } from "@/lib/notify/channels";
import { processReferralForNewUser } from "@/lib/referrals";
import { touchUserLastActive } from "@/lib/analytics";
import { getCurrentUser, persistIdentityCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

const InstantPayload = z.object({
  email: z.string().trim().email("Please enter a valid email address").optional(),
  zip: z.string().trim().optional(),
  locationLabel: z.string().trim().max(120).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  machineId: z.string().trim().max(32).optional(),
  ref: z.string().trim().max(64).optional(),
  lotteryOnly: z.boolean().optional(),
});

async function ensureUniqueHandle(db: Awaited<ReturnType<typeof getDb>>, seed: string): Promise<string> {
  let candidate = generateSpotterHandle(seed);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(sql`lower(${userTable.name}) = ${candidate.toLowerCase()}`);
    if (!existing) return candidate;
    candidate = generateSpotterHandle(`${seed}-${attempt}-${Math.floor(Math.random() * 9999)}`);
  }
  return candidate;
}

async function addSubscriptionIfMissing(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  kind: "area_drop" | "machine_drop" | "news",
  opts: {
    machineId?: string | null;
    lat?: number | null;
    lng?: number | null;
    radiusMiles?: number | null;
    keyword?: string | null;
    leadMinutes?: number;
  },
) {
  const existing = await db
    .select()
    .from(alertSubscriptions)
    .where(and(eq(alertSubscriptions.userId, userId), eq(alertSubscriptions.kind, kind)));

  const duplicate = existing.find((s) => {
    if (opts.machineId && s.machineId === opts.machineId) return true;
    if (opts.keyword && s.keyword && s.keyword.toLowerCase() === opts.keyword.toLowerCase()) return true;
    return false;
  });

  if (duplicate) {
    if (!duplicate.active) {
      await db
        .update(alertSubscriptions)
        .set({ active: true })
        .where(eq(alertSubscriptions.id, duplicate.id));
    }
    return duplicate.id;
  }

  const [inserted] = await db
    .insert(alertSubscriptions)
    .values({
      userId,
      kind,
      machineId: opts.machineId ?? null,
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
      radiusMiles: opts.radiusMiles ?? null,
      keyword: opts.keyword ?? null,
      leadMinutes: opts.leadMinutes ?? 10,
      channels: ["email", "push"],
      maxPerDay: 8,
      active: true,
    })
    .returning();
  return inserted?.id;
}

export const POST = route(async (req) => {
  const body = InstantPayload.parse(await json(req));
  const db = await getDb();
  const currentUser = await getCurrentUser();

  // Resolve ZIP or lat/lng if provided
  const cleanZip = body.zip && /^\d{5}$/.test(body.zip) ? body.zip : null;
  let resolvedLat = typeof body.lat === "number" ? body.lat : null;
  let resolvedLng = typeof body.lng === "number" ? body.lng : null;

  if (cleanZip && (resolvedLat == null || resolvedLng == null)) {
    const zMem = lookupZipCentroid(cleanZip);
    const zDb = zMem ? null : (await db.select().from(zipCodes).where(eq(zipCodes.zip, cleanZip)))[0];
    const z = zMem ?? zDb;
    if (z) {
      resolvedLat = z.lat;
      resolvedLng = z.lng;
    }
  }

  let targetUser: User | null = currentUser;
  let createdAccount = false;
  let signedInNow = Boolean(currentUser);
  let existingLoggedOutAccount = false;

  if (!targetUser) {
    if (!body.email) {
      throw new Error("Please enter your email address.");
    }
    const emailLower = body.email.toLowerCase();
    const [existing] = await db
      .select()
      .from(userTable)
      .where(sql`lower(${userTable.email}) = ${emailLower}`);

    if (existing) {
      targetUser = existing;
      existingLoggedOutAccount = true;
      signedInNow = false;
    } else {
      const handle = await ensureUniqueHandle(db, emailLower);
      const userId = crypto.randomUUID();
      const now = new Date();
      const [inserted] = await db
        .insert(userTable)
        .values({
          id: userId,
          name: handle,
          email: emailLower,
          emailVerified: true,
          role: emailLower === "james@jpegtown.com" ? "admin" : "user",
          plan: emailLower === "james@jpegtown.com" ? "premium" : "free",
          reputation: 0,
          homeZip: cleanZip,
          homeLat: resolvedLat,
          homeLng: resolvedLng,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      targetUser = inserted;
      createdAccount = true;
      signedInNow = true;

      // Create 90-day session + signed identity cookie so user is immediately logged in
      const sessionToken = crypto.randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await db.insert(sessionTable).values({
        id: crypto.randomUUID(),
        token: sessionToken,
        userId: targetUser.id,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      await persistIdentityCookie(targetUser, sessionToken);
      void touchUserLastActive(db, targetUser.id);

      // Attribute referral if visitor arrived via ?ref= handle
      await processReferralForNewUser(db, targetUser, body.ref);
    }
  } else if (cleanZip && !targetUser.homeZip) {
    await db
      .update(userTable)
      .set({ homeZip: cleanZip, homeLat: resolvedLat, homeLng: resolvedLng })
      .where(eq(userTable.id, targetUser.id))
      .catch(() => {});
  }

  // Subscribe user to local area drops / machine drops + Online Lotteries & Release News
  const areaLabel =
    body.locationLabel ||
    (cleanZip ? `ZIP ${cleanZip}` : null);

  if (body.machineId) {
    await addSubscriptionIfMissing(db, targetUser.id, "machine_drop", {
      machineId: body.machineId,
      leadMinutes: 10,
    });
  }

  if (!body.lotteryOnly && resolvedLat != null && resolvedLng != null) {
    await addSubscriptionIfMissing(db, targetUser.id, "area_drop", {
      lat: resolvedLat,
      lng: resolvedLng,
      radiusMiles: 15,
      keyword: areaLabel ?? "Your searched area",
      leadMinutes: 10,
    });
  }

  // Always activate Online Lottery + Retail Release News (Target, Walmart, Pokemon Center, Costco)
  await addSubscriptionIfMissing(db, targetUser.id, "news", {
    keyword: "ALL_RELEASE_NEWS",
    leadMinutes: 5,
  });
  await addSubscriptionIfMissing(db, targetUser.id, "news", {
    keyword: "ONLINE_LOTTERIES",
    leadMinutes: 5,
  });

  if (createdAccount) {
    const siteOrigin =
      process.env.SITE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "https://packradar.onrender.com";
    const inviteUrl = `${siteOrigin}/?ref=${encodeURIComponent(targetUser.name)}`;
    const areaSentence =
      !body.lotteryOnly && areaLabel
        ? `• 10-minute pre-drop warnings for vending machines within 15 miles of ${areaLabel}\n`
        : body.machineId
          ? `• 10-minute pre-drop warnings for machine ${body.machineId}\n`
          : cleanZip
            ? `• Instant notification if a Pokémon vending kiosk opens near ZIP ${cleanZip}\n`
            : "";

    void sendEmail(targetUser.email, {
      title: `Welcome to PackRadar, @${targetUser.name}! Your Drop & Lottery Alerts are Active`,
      body: `Your free PackRadar Spotter account (@${targetUser.name}) is ready and all live drop timers are unlocked.\n\nActive alerts on your account:\n${areaSentence}• Online Lotteries, Virtual Queues & MSRP Restocks (Target, Walmart, Pokémon Center, Sam's Club & Costco)\n\nWant VIP Early Lottery Alerts + 1 Free Month of PackRadar Pro?\nShare your personal invite link with your hunting buddies:\n${inviteUrl}\n• Invite 1 friend → Unlock VIP Early Lottery Alerts, Extra ZIP Radius, Multi-Machine Drive Route & +25 Leaderboard Rep\n• Invite 3 friends → Get 1 Month of PackRadar Pro Free`,
      url: cleanZip ? `/search?q=${cleanZip}` : "/alerts",
    }).catch(() => {});
  }

  return {
    ok: true,
    signedIn: signedInNow,
    createdAccount,
    existingLoggedOutAccount,
    handle: targetUser.name,
    referralUrl: `/?ref=${encodeURIComponent(targetUser.name)}`,
  };
});

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { alertSubscriptions, machines, notifications, products, user, zipCodes } from "@/db/schema";
import { lookupZipCentroid } from "@/db/seed";
import { effectivePlan, PLAN_LIMITS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const u = await requireUser();
  const db = await getDb();
  const subs = await db
    .select({ s: alertSubscriptions, m: machines, p: products })
    .from(alertSubscriptions)
    .leftJoin(machines, eq(machines.id, alertSubscriptions.machineId))
    .leftJoin(products, eq(products.id, alertSubscriptions.productId))
    .where(eq(alertSubscriptions.userId, u.id))
    .orderBy(desc(alertSubscriptions.createdAt));
  const inbox = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, u.id), eq(notifications.channel, "inapp")))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
  return { subscriptions: subs, inbox, plan: effectivePlan(u), limits: PLAN_LIMITS[effectivePlan(u)] };
});

const Create = z.object({
  kind: z.enum(["machine_drop", "schedule_change", "area_drop", "product_restock", "release", "news"]),
  machineId: z.string().optional(),
  productId: z.string().optional(),
  retailer: z.string().optional(),
  zip: z.string().regex(/^\d{5}$/).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusMiles: z.number().min(1).max(100).optional(),
  keyword: z.string().max(60).optional(),
  leadMinutes: z.number().int().min(1).max(60).default(5),
  channels: z.array(z.enum(["email", "push", "discord", "sms"])).min(1).default(["email", "push"]),
  maxPerDay: z.number().int().min(1).max(48).default(6),
  windowStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  windowEndMinute: z.number().int().min(0).max(1439).nullable().optional(),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const b = Create.parse(await json(req));
  const db = await getDb();
  const plan = effectivePlan(u);
  const limits = PLAN_LIMITS[plan];

  // Avoid duplicate active alert if user taps the same machine or news/drop topic twice
  const existingUserSubs = await db
    .select()
    .from(alertSubscriptions)
    .where(and(eq(alertSubscriptions.userId, u.id), eq(alertSubscriptions.active, true)));
  const resolvedKeyword = b.keyword ?? (b.kind === "area_drop" && b.zip ? `ZIP ${b.zip}` : null);
  const duplicate = existingUserSubs.find((s) => {
    if (s.kind !== b.kind) return false;
    if (b.machineId && s.machineId === b.machineId) return true;
    if (resolvedKeyword && s.keyword && s.keyword.toLowerCase() === resolvedKeyword.toLowerCase()) return true;
    return false;
  });
  if (duplicate) {
    return { ok: true, id: duplicate.id, alreadySubscribed: true };
  }

  const n = existingUserSubs.length;
  if (n >= limits.maxAlerts) throw new Error(`Alert limit reached (${limits.maxAlerts} active alerts).`);
  if (b.leadMinutes > limits.maxLeadMinutes) throw new Error(`Lead time must be ${limits.maxLeadMinutes} minutes or less.`);
  if (b.channels.includes("sms") && !limits.channels.includes("sms")) throw new Error("SMS alerts are coming soon.");
  if ((b.kind === "machine_drop" || b.kind === "schedule_change") && !b.machineId) throw new Error("machineId required");

  let lat = b.lat ?? null;
  let lng = b.lng ?? null;
  if (b.kind === "area_drop" && b.zip) {
    const zMem = lookupZipCentroid(b.zip);
    const zDb = zMem ? null : (await db.select().from(zipCodes).where(eq(zipCodes.zip, b.zip)))[0];
    const z = zMem ?? zDb;
    if (!z) throw new Error(`Could not locate ZIP code ${b.zip}`);
    lat = z.lat;
    lng = z.lng;
    if (!u.homeZip) {
      await db.update(user).set({ homeZip: b.zip, homeLat: lat, homeLng: lng }).where(eq(user.id, u.id)).catch(() => {});
    }
  }
  if (b.kind === "area_drop" && (lat == null || lng == null)) throw new Error("Please enter a valid 5-digit US ZIP code");

  const [s] = await db
    .insert(alertSubscriptions)
    .values({
      userId: u.id,
      kind: b.kind,
      machineId: b.machineId ?? null,
      productId: b.productId ?? null,
      retailer: b.retailer ?? null,
      lat,
      lng,
      radiusMiles: b.radiusMiles ?? (b.kind === "area_drop" ? 10 : null),
      keyword: b.keyword ?? (b.kind === "area_drop" && b.zip ? `ZIP ${b.zip}` : null),
      leadMinutes: b.leadMinutes,
      channels: b.channels,
      maxPerDay: b.maxPerDay,
      windowStartMinute: b.windowStartMinute ?? null,
      windowEndMinute: b.windowEndMinute ?? null,
    })
    .returning();
  return { ok: true, id: s.id };
});

const Patch = z.object({
  id: z.string(),
  active: z.boolean().optional(),
  leadMinutes: z.number().int().min(1).max(60).optional(),
  channels: z.array(z.enum(["email", "push", "discord", "sms"])).min(1).optional(),
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const b = Patch.parse(await json(req));
  const db = await getDb();
  const { id, ...rest } = b;
  await db.update(alertSubscriptions).set(rest).where(and(eq(alertSubscriptions.id, id), eq(alertSubscriptions.userId, u.id)));
  return { ok: true };
});

export const DELETE = route(async (req) => {
  const u = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new Error("id required");
  const db = await getDb();
  await db.delete(alertSubscriptions).where(and(eq(alertSubscriptions.id, id), eq(alertSubscriptions.userId, u.id)));
  return { ok: true };
});

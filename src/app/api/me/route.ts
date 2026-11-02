import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { persistIdentityCookie, requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { user, zipCodes } from "@/db/schema";
import { lookupZipCentroid } from "@/db/seed";
import { sendDiscord } from "@/lib/notify/channels";

const Patch = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  homeZip: z.string().regex(/^\d{5}$/).nullable().optional(),
  discordWebhookUrl: z.string().url().nullable().optional().or(z.literal("")),
  quietHoursStart: z.number().int().min(0).max(1439).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(1439).nullable().optional(),
  testDiscord: z.boolean().optional(),
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const b = Patch.parse(await json(req));
  const db = await getDb();
  const patch: Partial<typeof user.$inferInsert> = {};
  if (b.name) patch.name = b.name;
  if (b.homeZip !== undefined) {
    patch.homeZip = b.homeZip;
    if (b.homeZip) {
      const zMem = lookupZipCentroid(b.homeZip);
      const zDb = zMem ? null : (await db.select().from(zipCodes).where(eq(zipCodes.zip, b.homeZip)))[0];
      const z = zMem ?? zDb;
      patch.homeLat = z?.lat ?? null;
      patch.homeLng = z?.lng ?? null;
    }
  }
  if (b.discordWebhookUrl !== undefined) patch.discordWebhookUrl = b.discordWebhookUrl || null;
  if (b.quietHoursStart !== undefined) patch.quietHoursStart = b.quietHoursStart;
  if (b.quietHoursEnd !== undefined) patch.quietHoursEnd = b.quietHoursEnd;
  if (Object.keys(patch).length) {
    await db.update(user).set(patch).where(eq(user.id, u.id));
    const [fresh] = await db.select().from(user).where(eq(user.id, u.id));
    if (fresh) await persistIdentityCookie(fresh);
  }
  if (b.testDiscord) {
    const url = (patch.discordWebhookUrl ?? u.discordWebhookUrl) as string | null;
    if (!url) throw new Error("Add a Discord webhook URL first");
    await sendDiscord(url, { title: "PackRadar test alert ⚡", body: "Your Discord alerts are working!", url: "/alerts" });
  }
  return { ok: true };
});

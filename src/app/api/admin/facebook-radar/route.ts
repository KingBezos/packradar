import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { requireRole } from "@/lib/session";
import {
  buildCleverFacebookReply,
  scanFacebookOpportunities,
  type FacebookOpportunity,
} from "@/lib/facebook-radar";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "1";

  const [row] = await db.select().from(settings).where(eq(settings.key, "facebookOpportunitiesV1"));
  const cached = Array.isArray(row?.value) ? (row.value as FacebookOpportunity[]) : [];
  const hasStaleSearchLinks = cached.some((item) => item.permalink?.includes("/search/"));

  if (!refresh && cached.length > 0 && !hasStaleSearchLinks) {
    return { opportunities: cached };
  }

  const opportunities = await scanFacebookOpportunities(db);
  return { opportunities };
});

const PostBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("scan"),
  }),
  z.object({
    action: z.literal("draft_custom"),
    groupName: z.string().optional(),
    title: z.string().min(2).max(800),
    body: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal("set_status"),
    id: z.string(),
    status: z.enum(["open", "replied", "dismissed"]),
  }),
]);

export const POST = route(async (req) => {
  await requireRole(["admin", "mod"]);
  const b = PostBody.parse(await json(req));
  const db = await getDb();

  if (b.action === "scan") {
    const opportunities = await scanFacebookOpportunities(db);
    return { ok: true, opportunities };
  }

  if (b.action === "draft_custom") {
    const draft = await buildCleverFacebookReply(db, {
      groupName: b.groupName,
      title: b.title,
      body: b.body,
    });
    return { ok: true, draft };
  }

  if (b.action === "set_status") {
    const [row] = await db.select().from(settings).where(eq(settings.key, "facebookOpportunitiesV1"));
    const list: FacebookOpportunity[] = Array.isArray(row?.value) ? (row.value as FacebookOpportunity[]) : [];
    const updated = list.map((item) => (item.id === b.id ? { ...item, status: b.status } : item));
    await db
      .insert(settings)
      .values({ key: "facebookOpportunitiesV1", value: updated })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: updated, updatedAt: new Date() },
      });
    return { ok: true, opportunities: updated };
  }

  throw new Error("Invalid action");
});

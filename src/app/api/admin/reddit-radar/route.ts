import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { requireRole } from "@/lib/session";
import {
  buildDataBackedRedditReply,
  scanLiveRedditOpportunities,
  type RedditOpportunity,
} from "@/lib/reddit-radar";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "1";

  const [row] = await db.select().from(settings).where(eq(settings.key, "redditOpportunitiesV1"));
  if (!refresh && Array.isArray(row?.value) && row.value.length > 0) {
    return { opportunities: row.value as RedditOpportunity[] };
  }

  const opportunities = await scanLiveRedditOpportunities(db);
  return { opportunities };
});

const PostBody = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("scan"),
  }),
  z.object({
    action: z.literal("draft_custom"),
    subreddit: z.string().optional(),
    title: z.string().min(2).max(500),
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
    const opportunities = await scanLiveRedditOpportunities(db);
    return { ok: true, opportunities };
  }

  if (b.action === "draft_custom") {
    const draft = await buildDataBackedRedditReply(db, {
      subreddit: b.subreddit || "r/PokemonTCG",
      title: b.title,
      body: b.body,
    });
    return { ok: true, draft };
  }

  if (b.action === "set_status") {
    const [row] = await db.select().from(settings).where(eq(settings.key, "redditOpportunitiesV1"));
    const list: RedditOpportunity[] = Array.isArray(row?.value) ? (row.value as RedditOpportunity[]) : [];
    const updated = list.map((item) => (item.id === b.id ? { ...item, status: b.status } : item));
    await db
      .insert(settings)
      .values({ key: "redditOpportunitiesV1", value: updated })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: updated, updatedAt: new Date() },
      });
    return { ok: true, opportunities: updated };
  }

  throw new Error("Invalid action");
});

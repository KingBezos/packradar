import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { requireRole } from "@/lib/session";
import {
  REDDIT_USERNAME,
  INITIAL_COMMENTED_THREAD_IDS,
  buildDataBackedRedditReply,
  getAndSyncCommentedThreadIds,
  markRedditThreadCommented,
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
  const cached = Array.isArray(row?.value) ? (row.value as RedditOpportunity[]) : [];
  const ageMs = row?.updatedAt ? Date.now() - new Date(row.updatedAt).getTime() : Infinity;
  const isStaleTtl = ageMs > 2 * 60_000;

  const retiredSet = new Set(INITIAL_COMMENTED_THREAD_IDS.map((x) => x.toLowerCase()));
  const hasLegacyOrCommentedCache =
    cached.length < 15 ||
    isStaleTtl ||
    cached.some(
      (item) =>
        !item.permalink?.includes("/comments/") ||
        !item.category ||
        item.status !== "open" ||
        retiredSet.has(item.id.toLowerCase()),
    );

  if (!refresh && !hasLegacyOrCommentedCache) {
    const [cRow] = await db.select().from(settings).where(eq(settings.key, "redditCommentedIdsV1"));
    const cList = Array.isArray(cRow?.value) ? (cRow.value as string[]) : INITIAL_COMMENTED_THREAD_IDS;
    return {
      opportunities: cached,
      redditUsername: REDDIT_USERNAME,
      excludedCommentedCount: cList.length,
      lastUpdatedAt: row?.updatedAt,
    };
  }

  const opportunities = await scanLiveRedditOpportunities(db);
  const commentedSet = await getAndSyncCommentedThreadIds(db);
  return {
    opportunities,
    redditUsername: REDDIT_USERNAME,
    excludedCommentedCount: commentedSet.size,
    lastUpdatedAt: new Date().toISOString(),
  };
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
    permalink: z.string().optional(),
    status: z.enum(["open", "replied", "dismissed"]),
  }),
]);

export const POST = route(async (req) => {
  await requireRole(["admin", "mod"]);
  const b = PostBody.parse(await json(req));
  const db = await getDb();

  if (b.action === "scan") {
    const opportunities = await scanLiveRedditOpportunities(db);
    const commentedSet = await getAndSyncCommentedThreadIds(db);
    return {
      ok: true,
      opportunities,
      redditUsername: REDDIT_USERNAME,
      excludedCommentedCount: commentedSet.size,
    };
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
    const target = list.find((item) => item.id === b.id);

    if (b.status === "replied" || b.status === "dismissed") {
      await markRedditThreadCommented(db, b.id, b.permalink || target?.permalink);
    }

    // Remove commented/dismissed threads from the active list so they never clutter the scanner again
    const updated =
      b.status === "open"
        ? list.map((item) => (item.id === b.id ? { ...item, status: "open" as const } : item))
        : list.filter((item) => item.id !== b.id);

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

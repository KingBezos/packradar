import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { requireRole } from "@/lib/session";
import {
  REDDIT_USERNAME,
  CLICKED_HOLD_DURATION_MS,
  INITIAL_COMMENTED_THREAD_IDS,
  buildDataBackedRedditReply,
  getAndSyncCommentedThreadIds,
  markRedditThreadClicked,
  markRedditThreadCommented,
  scanLiveRedditOpportunities,
  sortOpportunitiesOpenFirst,
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
  const isStaleTtl = ageMs > 30 * 60_000;

  const retiredSet = new Set(INITIAL_COMMENTED_THREAD_IDS.map((x) => x.toLowerCase()));
  const hasLegacyOrCommentedCache =
    cached.length < 15 ||
    isStaleTtl ||
    cached.some(
      (item) =>
        !item.permalink?.includes("/comments/") ||
        item.topComments === undefined ||
        item.helpfulReplyDraft?.includes('"Get Alerts"') ||
        !item.category ||
        (item.status !== "open" && item.status !== "clicked") ||
        retiredSet.has(item.id.toLowerCase()),
    );

  if (!refresh && !hasLegacyOrCommentedCache) {
    // Auto-expire any clicked threads older than 2 hours
    const now = Date.now();
    let prunedAny = false;
    const kept: RedditOpportunity[] = [];
    for (const item of cached) {
      if (
        item.status === "clicked" &&
        item.clickedAt &&
        now - new Date(item.clickedAt).getTime() >= CLICKED_HOLD_DURATION_MS
      ) {
        await markRedditThreadCommented(db, item.id, item.permalink);
        prunedAny = true;
      } else {
        kept.push(item);
      }
    }
    const sorted = sortOpportunitiesOpenFirst(kept);
    if (prunedAny) {
      await db
        .insert(settings)
        .values({ key: "redditOpportunitiesV1", value: sorted })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: sorted, updatedAt: new Date() },
        });
    }

    const [cRow] = await db.select().from(settings).where(eq(settings.key, "redditCommentedIdsV1"));
    const cList = Array.isArray(cRow?.value) ? (cRow.value as string[]) : INITIAL_COMMENTED_THREAD_IDS;
    return {
      opportunities: sorted,
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
    status: z.enum(["open", "clicked", "replied", "dismissed"]),
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

    let clickedAtIso: string | null = null;
    if (b.status === "clicked") {
      clickedAtIso = await markRedditThreadClicked(db, b.id, b.permalink || target?.permalink);
    }

    const now = Date.now();
    const updatedRaw: RedditOpportunity[] = [];
    for (const item of list) {
      if (item.id === b.id) {
        if (b.status === "open") {
          updatedRaw.push({ ...item, status: "open", clickedAt: null });
        } else if (b.status === "clicked") {
          updatedRaw.push({
            ...item,
            status: "clicked",
            clickedAt: clickedAtIso || new Date().toISOString(),
          });
        }
        // if replied or dismissed, omit from list (removed immediately)
        continue;
      }
      // Also auto-expire any other clicked thread that passed 2 hours
      if (
        item.status === "clicked" &&
        item.clickedAt &&
        now - new Date(item.clickedAt).getTime() >= CLICKED_HOLD_DURATION_MS
      ) {
        await markRedditThreadCommented(db, item.id, item.permalink);
        continue;
      }
      updatedRaw.push(item);
    }

    const updated = sortOpportunitiesOpenFirst(updatedRaw);

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

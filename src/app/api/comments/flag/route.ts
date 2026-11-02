import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { comments, settings, user } from "@/db/schema";
import type { AdminInboxItem } from "@/app/api/contact/route";

export const dynamic = "force-dynamic";

export const COMMENT_FLAGS_KEY = "commentFlags";
const INBOX_KEY = "adminAlertsInbox";

export type CommentFlagRecord = {
  uniqueIpHashes: string[];
  reasons: string[];
  firstFlaggedAt: string;
  lastFlaggedAt: string;
  alertedAdmin: boolean;
};

export type CommentFlagsMap = Record<string, CommentFlagRecord>;

function getClientIpHash(req: Request, clientHint?: string): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    clientHint ||
    "local-ip";
  return crypto.createHash("sha256").update(`packradar-flag:${ip}`).digest("hex").slice(0, 16);
}

export async function loadCommentFlags(db: Awaited<ReturnType<typeof getDb>>): Promise<CommentFlagsMap> {
  const [row] = await db.select().from(settings).where(eq(settings.key, COMMENT_FLAGS_KEY));
  return ((row?.value as CommentFlagsMap) ?? {}) as CommentFlagsMap;
}

async function saveCommentFlags(db: Awaited<ReturnType<typeof getDb>>, map: CommentFlagsMap) {
  await db
    .insert(settings)
    .values({ key: COMMENT_FLAGS_KEY, value: map, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: map, updatedAt: new Date() },
    });
}

const FlagSchema = z.object({
  commentId: z.string().min(1),
  reason: z.string().trim().max(200).optional(),
  clientVoterKey: z.string().max(64).optional(),
});

export const POST = route(async (req) => {
  const b = FlagSchema.parse(await json(req));
  const db = await getDb();

  const [found] = await db
    .select({
      c: comments,
      authorName: user.name,
    })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.userId))
    .where(eq(comments.id, b.commentId));

  if (!found) throw new Error("Comment not found");

  const ipHash = getClientIpHash(req, b.clientVoterKey);
  const flagsMap = await loadCommentFlags(db);
  const nowIso = new Date().toISOString();

  const existing: CommentFlagRecord = flagsMap[b.commentId] ?? {
    uniqueIpHashes: [],
    reasons: [],
    firstFlaggedAt: nowIso,
    lastFlaggedAt: nowIso,
    alertedAdmin: false,
  };

  if (!existing.uniqueIpHashes.includes(ipHash)) {
    existing.uniqueIpHashes.push(ipHash);
  }
  if (b.reason && !existing.reasons.includes(b.reason)) {
    existing.reasons.push(b.reason);
  }
  existing.lastFlaggedAt = nowIso;

  // Alert Admin automatically once flagged by at least 2 unique IPs
  const uniqueCount = existing.uniqueIpHashes.length;
  let triggeredAdminAlert = false;

  if (uniqueCount >= 2 && !existing.alertedAdmin) {
    existing.alertedAdmin = true;
    triggeredAdminAlert = true;

    const [inboxRow] = await db.select().from(settings).where(eq(settings.key, INBOX_KEY));
    const currentInbox = Array.isArray((inboxRow?.value as { items?: AdminInboxItem[] })?.items)
      ? ((inboxRow?.value as { items: AdminInboxItem[] }).items ?? [])
      : [];

    const pageUrl =
      found.c.targetType === "machine"
        ? `/machines/${found.c.targetId}`
        : `/news`;

    const alertItem: AdminInboxItem = {
      id: crypto.randomUUID(),
      kind: "admin_alert",
      category: "flagged_comment",
      subject: `🚩 Comment Flagged by ${uniqueCount} Unique IPs (${found.c.targetType} ${found.c.targetId})`,
      message: `Comment by "${found.authorName || "Spotter"}":\n"${found.c.body}"\n\nReasons: ${
        existing.reasons.length ? existing.reasons.join(", ") : "Community flagged as spam / inappropriate"
      }`,
      machineId: found.c.targetType === "machine" ? found.c.targetId : null,
      pageUrl,
      senderName: `${uniqueCount} Community Reporters`,
      status: "open",
      emailStatus: "none",
      createdAt: nowIso,
    };

    await db
      .insert(settings)
      .values({ key: INBOX_KEY, value: { items: [alertItem, ...currentInbox].slice(0, 250) }, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: { items: [alertItem, ...currentInbox].slice(0, 250) }, updatedAt: new Date() },
      });
  }

  flagsMap[b.commentId] = existing;
  await saveCommentFlags(db, flagsMap);

  return {
    ok: true,
    uniqueFlags: uniqueCount,
    triggeredAdminAlert,
    message:
      uniqueCount >= 2
        ? "Comment flagged — Admin has been alerted for moderation review."
        : "Flag recorded. If another user also flags this comment, Admin is alerted automatically.",
  };
});

/** Admin DELETE: clear flags on a reviewed comment. */
export const DELETE = route(async (req) => {
  await requireRole(["mod", "admin"]);
  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get("commentId");
  if (!commentId) throw new Error("commentId required");
  const db = await getDb();
  const flagsMap = await loadCommentFlags(db);
  delete flagsMap[commentId];
  await saveCommentFlags(db, flagsMap);
  return { ok: true };
});

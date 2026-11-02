import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { comments, reactions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

const Body = z.object({
  targetType: z.enum(["machine", "news"]),
  targetId: z.string().min(1).max(100),
  body: z.string().trim().min(1).max(1000).optional(),
  emoji: z.enum(["🔥", "👍", "😂", "😮", "😢", "⚡"]).optional(),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const b = Body.parse(await json(req));
  const db = await getDb();
  if (b.emoji) {
    rateLimit(`react:${u.id}`, 120, 3_600_000);
    const where = and(
      eq(reactions.targetType, b.targetType),
      eq(reactions.targetId, b.targetId),
      eq(reactions.userId, u.id),
      eq(reactions.emoji, b.emoji),
    );
    const [existing] = await db.select().from(reactions).where(where);
    if (existing) await db.delete(reactions).where(where);
    else await db.insert(reactions).values({ targetType: b.targetType, targetId: b.targetId, userId: u.id, emoji: b.emoji });
    return { ok: true, reacted: !existing };
  }
  if (!b.body) throw new Error("Comment is empty");
  rateLimit(`comment:${u.id}`, 15, 600_000);
  const [c] = await db.insert(comments).values({ targetType: b.targetType, targetId: b.targetId, userId: u.id, body: b.body }).returning();
  if (b.targetType === "machine") {
    await logActivity(db, {
      type: "comment",
      machineId: b.targetId,
      userId: u.id,
      message: `💬 ${u.name} commented on ${b.targetId}`,
      url: `/machines/${b.targetId}`,
    });
  }
  return { ok: true, id: c.id };
});

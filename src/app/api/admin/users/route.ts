import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { persistIdentityCookie, requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { account, alertSubscriptions, reputationEvents, session, user } from "@/db/schema";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole(["admin", "mod"]);
  const db = await getDb();
  const [users, accounts, subs] = await Promise.all([
    db.select().from(user).orderBy(desc(user.createdAt)),
    db.select({ userId: account.userId, providerId: account.providerId }).from(account),
    db.select({ userId: alertSubscriptions.userId, active: alertSubscriptions.active }).from(alertSubscriptions),
  ]);

  const providersByUser = new Map<string, string[]>();
  for (const a of accounts) {
    const list = providersByUser.get(a.userId) ?? [];
    if (!list.includes(a.providerId)) list.push(a.providerId);
    providersByUser.set(a.userId, list);
  }

  const alertsByUser = new Map<string, number>();
  for (const s of subs) {
    if (s.active) alertsByUser.set(s.userId, (alertsByUser.get(s.userId) ?? 0) + 1);
  }

  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role,
      reputation: u.reputation,
      plan: u.plan,
      homeZip: u.homeZip,
      createdAt: u.createdAt,
      providers: providersByUser.get(u.id) ?? ["credential"],
      activeAlerts: alertsByUser.get(u.id) ?? 0,
    })),
  };
});

const PatchUser = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2).max(40).optional(),
  role: z.enum(["user", "mod", "admin"]).optional(),
  plan: z.enum(["free", "premium"]).optional(),
  emailVerified: z.boolean().optional(),
  reputation: z.number().int().min(-1000).max(100000).optional(),
});

export const PATCH = route(async (req) => {
  const adminUser = await requireRole(["admin"]);
  const b = PatchUser.parse(await json(req));
  const db = await getDb();
  const [existing] = await db.select().from(user).where(eq(user.id, b.userId));
  if (!existing) throw new Error("User not found");

  const patch: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) patch.name = b.name;
  if (b.role !== undefined) patch.role = b.role;
  if (b.plan !== undefined) patch.plan = b.plan;
  if (b.emailVerified !== undefined) patch.emailVerified = b.emailVerified;
  if (b.reputation !== undefined) patch.reputation = b.reputation;

  await db.update(user).set(patch).where(eq(user.id, b.userId));

  if (b.reputation !== undefined) {
    const delta = b.reputation - (existing.reputation ?? 0);
    if (delta !== 0) {
      await db.insert(reputationEvents).values({
        userId: b.userId,
        delta,
        reason: "Admin reputation adjustment",
      });
    }
  }

  const [updated] = await db.select().from(user).where(eq(user.id, b.userId));
  if (updated && updated.id === adminUser.id) {
    await persistIdentityCookie(updated);
  }

  return { ok: true, user: updated };
});

export const DELETE = route(async (req) => {
  const adminUser = await requireRole(["admin"]);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new Error("User ID required");
  if (id === adminUser.id) throw new Error("Cannot delete your own active admin account");
  const db = await getDb();
  await db.delete(session).where(eq(session.userId, id));
  await db.delete(account).where(eq(account.userId, id));
  await db.delete(alertSubscriptions).where(eq(alertSubscriptions.userId, id));
  await db.delete(user).where(eq(user.id, id));
  return { ok: true };
});

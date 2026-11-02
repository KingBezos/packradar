import { and, eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { alertSubscriptions, favorites } from "@/db/schema";

/** Toggle favorite. Favoriting also creates a "drop alert" subscription (5 min lead) the user can tweak. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  const db = await getDb();
  const [f] = await db.select().from(favorites).where(and(eq(favorites.userId, u.id), eq(favorites.machineId, id)));
  if (f) {
    await db.delete(favorites).where(and(eq(favorites.userId, u.id), eq(favorites.machineId, id)));
    return { favorite: false };
  }
  await db.insert(favorites).values({ userId: u.id, machineId: id });
  return { favorite: true };
});

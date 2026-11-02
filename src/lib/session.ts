import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { auth, generateSpotterHandle } from "@/lib/auth";
import { getDb } from "@/db";
import { session as sessionTable, user as userTable, type User } from "@/db/schema";

async function sanitizeUserPrivacy(db: Awaited<ReturnType<typeof getDb>>, u: User): Promise<User> {
  const needsHandle = Boolean(u.image) || !u.name || u.name.includes(" ") || u.name.includes("@");
  if (!u.image && !needsHandle) return u;
  const newName = needsHandle ? generateSpotterHandle(u.email || u.id) : u.name;
  await db
    .update(userTable)
    .set({ name: newName, image: null })
    .where(eq(userTable.id, u.id))
    .catch(() => {});
  return { ...u, name: newName, image: null };
}

/** Current signed-in user (full DB row) or null. */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const jar = await cookies();
    const rawCookie =
      jar.get("better-auth.session_token")?.value ??
      jar.get("__Secure-better-auth.session_token")?.value;
    if (!rawCookie) return null;

    const db = await getDb();
    const decoded = decodeURIComponent(rawCookie);
    const tokenPrefix = decoded.split(".")[0];
    if (tokenPrefix) {
      const [sess] = await db
        .select()
        .from(sessionTable)
        .where(and(eq(sessionTable.token, tokenPrefix), gt(sessionTable.expiresAt, new Date())));
      if (sess) {
        const [u] = await db.select().from(userTable).where(eq(userTable.id, sess.userId));
        if (u) return await sanitizeUserPrivacy(db, u);
      }
    }

    const h = await headers();
    const session = await auth.api.getSession({ headers: h }).catch(() => null);
    if (session?.user?.id) {
      const [u] = await db.select().from(userTable).where(eq(userTable.id, session.user.id));
      if (u) return await sanitizeUserPrivacy(db, u);
    }
  } catch {
    // ignore cookie parse or static generation errors
  }

  return null;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("Sign in required", 401);
  return u;
}

export async function requireRole(roles: ("mod" | "admin")[]): Promise<User> {
  const u = await requireUser();
  if (!roles.includes(u.role as "mod" | "admin")) throw new AuthError("Not allowed", 403);
  return u;
}

export function isStaff(u: User | null | undefined) {
  return u?.role === "admin" || u?.role === "mod";
}

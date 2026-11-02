import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { auth, generateSpotterHandle } from "@/lib/auth";
import { getDb } from "@/db";
import { session as sessionTable, user as userTable, type User } from "@/db/schema";

const IDENTITY_COOKIE = "packradar.identity";
const OWNER_DEFAULT_HANDLES: Record<string, string> = {
  "james@jpegtown.com": "King_Bezos",
};

function identitySecret(): string {
  return process.env.BETTER_AUTH_SECRET || "dev-only-insecure-secret-change-me-in-production-0123456789";
}

type IdentityPayload = {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  reputation: number;
  homeZip: string | null;
  sessionToken?: string;
};

export function signIdentityCookie(payload: IdentityPayload): string {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", identitySecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyIdentityCookie(raw?: string | null): IdentityPayload | null {
  if (!raw || !raw.includes(".")) return null;
  const [data, sig] = raw.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", identitySecret()).update(data).digest("base64url");
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as IdentityPayload;
  } catch {
    return null;
  }
}

export async function persistIdentityCookie(u: User, sessionToken?: string) {
  try {
    const jar = await cookies();
    const existing = verifyIdentityCookie(jar.get(IDENTITY_COOKIE)?.value);
    const signed = signIdentityCookie({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      plan: u.plan,
      reputation: u.reputation ?? 0,
      homeZip: u.homeZip ?? null,
      sessionToken: sessionToken ?? existing?.sessionToken,
    });
    jar.set(IDENTITY_COOKIE, signed, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 90, // 90 days
    });
  } catch {
    // cookies() cannot be mutated inside Server Component render, only Route Handlers / Server Actions
  }
}

async function sanitizeUserPrivacy(
  db: Awaited<ReturnType<typeof getDb>>,
  u: User,
  cookieProfile?: IdentityPayload | null,
): Promise<User> {
  const emailLower = u.email.toLowerCase();
  const ownerEmails = [
    "james@jpegtown.com",
    ...(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ];
  const shouldBeAdmin = ownerEmails.includes(emailLower) && u.role !== "admin";
  const defaultAutoHandle = generateSpotterHandle(u.email).toLowerCase();
  const isDefaultAutoHandle = (u.name || "").toLowerCase() === defaultAutoHandle;

  // Determine the user's preferred handle:
  // 1) If cookieProfile has a custom name for this user while DB has a freshly-generated handle, restore cookie name
  // 2) If owner email (james@jpegtown.com) still has auto-generated LugiaScout892, set to King_Bezos
  // 3) Only generate a handle if name is blank or an email address (never overwrite custom names like King_Bezos!)
  let desiredName = (u.name || "").trim();
  if (
    cookieProfile &&
    cookieProfile.email.toLowerCase() === emailLower &&
    cookieProfile.name &&
    cookieProfile.name !== u.name &&
    isDefaultAutoHandle
  ) {
    desiredName = cookieProfile.name;
  } else if (OWNER_DEFAULT_HANDLES[emailLower] && (!desiredName || isDefaultAutoHandle)) {
    desiredName = OWNER_DEFAULT_HANDLES[emailLower];
  } else if (!desiredName || desiredName.includes("@")) {
    desiredName = OWNER_DEFAULT_HANDLES[emailLower] ?? generateSpotterHandle(u.email || u.id);
  }

  const nameChanged = desiredName !== u.name;
  const hasImage = Boolean(u.image);
  if (!hasImage && !nameChanged && !shouldBeAdmin) return u;

  const newRole = shouldBeAdmin ? "admin" : u.role;
  await db
    .update(userTable)
    .set({
      name: desiredName,
      image: null,
      role: newRole,
      ...(shouldBeAdmin ? { emailVerified: true } : {}),
    })
    .where(eq(userTable.id, u.id))
    .catch(() => {});

  return {
    ...u,
    name: desiredName,
    image: null,
    role: newRole,
    ...(shouldBeAdmin ? { emailVerified: true } : {}),
  };
}

/** Current signed-in user (full DB row) or null. Self-heals across container restarts. */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const jar = await cookies();
    const rawCookie =
      jar.get("better-auth.session_token")?.value ??
      jar.get("__Secure-better-auth.session_token")?.value;
    const identity = verifyIdentityCookie(jar.get(IDENTITY_COOKIE)?.value);

    const db = await getDb();
    const decoded = rawCookie ? decodeURIComponent(rawCookie) : "";
    const tokenPrefix = decoded ? decoded.split(".")[0] : identity?.sessionToken;

    if (tokenPrefix) {
      const [sess] = await db
        .select()
        .from(sessionTable)
        .where(and(eq(sessionTable.token, tokenPrefix), gt(sessionTable.expiresAt, new Date())));
      if (sess) {
        const [u] = await db.select().from(userTable).where(eq(userTable.id, sess.userId));
        if (u) return await sanitizeUserPrivacy(db, u, identity);
      }
    }

    if (rawCookie) {
      const h = await headers();
      const session = await auth.api.getSession({ headers: h }).catch(() => null);
      if (session?.user?.id) {
        const [u] = await db.select().from(userTable).where(eq(userTable.id, session.user.id));
        if (u) return await sanitizeUserPrivacy(db, u, identity);
      }
    }

    // Container restart / redeploy recovery: if the browser has a valid HMAC-signed identity cookie
    // (or existing session token + identity), transparently re-hydrate the user & session in SQLite!
    if (identity?.email) {
      let [u] = await db.select().from(userTable).where(eq(userTable.email, identity.email));
      if (!u) {
        const [inserted] = await db
          .insert(userTable)
          .values({
            id: identity.id,
            email: identity.email,
            name: identity.name || OWNER_DEFAULT_HANDLES[identity.email.toLowerCase()] || generateSpotterHandle(identity.email),
            emailVerified: true,
            role: identity.email.toLowerCase() === "james@jpegtown.com" ? "admin" : identity.role || "user",
            plan: identity.plan || "free",
            reputation: identity.reputation || 0,
            homeZip: identity.homeZip || null,
          })
          .onConflictDoNothing()
          .returning();
        u = inserted ?? (await db.select().from(userTable).where(eq(userTable.email, identity.email)))[0];
      }
      if (u && tokenPrefix) {
        await db
          .insert(sessionTable)
          .values({
            id: `sess-${tokenPrefix.slice(0, 20)}`,
            userId: u.id,
            token: tokenPrefix,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60),
          })
          .onConflictDoNothing()
          .catch(() => {});
      }
      if (u) return await sanitizeUserPrivacy(db, u, identity);
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

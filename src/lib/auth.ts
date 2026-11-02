import fs from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

const OAUTH_FILE = path.join(process.cwd(), "data", "oauth-config.json");

export function getGoogleOAuthCreds(): { clientId: string; clientSecret: string } | null {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    };
  }
  try {
    if (fs.existsSync(OAUTH_FILE)) {
      const raw = JSON.parse(fs.readFileSync(OAUTH_FILE, "utf8")) as {
        googleClientId?: string;
        googleClientSecret?: string;
      };
      if (raw.googleClientId && raw.googleClientSecret) {
        process.env.GOOGLE_CLIENT_ID = raw.googleClientId.trim();
        process.env.GOOGLE_CLIENT_SECRET = raw.googleClientSecret.trim();
        return {
          clientId: raw.googleClientId.trim(),
          clientSecret: raw.googleClientSecret.trim(),
        };
      }
    }
  } catch {}
  return null;
}

function buildAuth() {
  const googleCreds = getGoogleOAuthCreds();
  const inferredSiteUrl =
    process.env.BETTER_AUTH_URL ||
    process.env.SITE_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    "http://localhost:3000";

  return betterAuth({
    appName: "PackRadar",
    trustedOrigins: [
      "http://localhost:*",
      "http://127.0.0.1:*",
      "http://192.168.*:*",
      "http://10.*:*",
      "http://172.16.*:*",
      "https://*.trycloudflare.com",
      "https://*.vercel.app",
      "https://*.up.railway.app",
      "https://*.onrender.com",
      "https://*.netlify.app",
      ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
      ...(process.env.SITE_URL ? [process.env.SITE_URL] : []),
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
      ...(process.env.RAILWAY_PUBLIC_DOMAIN ? [`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`] : []),
    ],
    baseURL: inferredSiteUrl,
    secret: process.env.BETTER_AUTH_SECRET || "dev-only-insecure-secret-change-me-in-production-0123456789",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    socialProviders: googleCreds
      ? {
          google: {
            clientId: googleCreds.clientId,
            clientSecret: googleCreds.clientSecret,
          },
        }
      : {},
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "user", input: false },
        reputation: { type: "number", defaultValue: 0, input: false },
        plan: { type: "string", defaultValue: "free", input: false },
        homeZip: { type: "string", required: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (u) => {
            const admins = (process.env.ADMIN_EMAILS || "")
              .split(",")
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);
            const [{ n }] = await db
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.user)
              .where(eq(schema.user.role, "admin"));
            if (admins.includes(u.email.toLowerCase()) || n === 0) {
              await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, u.id));
            }
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

const g = globalThis as unknown as { __packradarAuth?: ReturnType<typeof buildAuth> };

export function getAuth() {
  if (!g.__packradarAuth) {
    g.__packradarAuth = buildAuth();
  }
  return g.__packradarAuth;
}

export function reloadAuth() {
  g.__packradarAuth = buildAuth();
  return g.__packradarAuth;
}

export const auth = new Proxy({} as ReturnType<typeof buildAuth>, {
  get(_t, prop) {
    const inst = getAuth() as unknown as Record<string | symbol, unknown>;
    const v = inst[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(inst) : v;
  },
});

export function getAuthProviders() {
  return { google: Boolean(getGoogleOAuthCreds()) };
}

export const authProviders = {
  get google() {
    return Boolean(getGoogleOAuthCreds());
  },
};

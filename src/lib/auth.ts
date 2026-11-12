import fs from "node:fs";
import path from "node:path";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

const OAUTH_FILES = [
  path.join(process.cwd(), "data", "oauth-config.json"),
  "/tmp/packradar-oauth-config.json",
];

export function getGoogleOAuthCreds(): { clientId: string; clientSecret: string } | null {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
    };
  }
  for (const file of OAUTH_FILES) {
    try {
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
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
  }
  return null;
}

const HANDLE_PREFIXES = [
  "Volt",
  "Prismatic",
  "Shiny",
  "Umbreon",
  "Charizard",
  "Rayquaza",
  "Gengar",
  "Pikachu",
  "Eevee",
  "Sylveon",
  "Lucario",
  "Mewtwo",
  "Lugia",
  "Snorlax",
  "Dragonite",
  "Greninja",
  "Tyranitar",
  "Arcanine",
  "Suicune",
  "Zoroark",
  "Mimikyu",
  "Dragapult",
  "Gardevoir",
  "Darkrai",
];

const HANDLE_ROLES = [
  "Spotter",
  "Scout",
  "Trainer",
  "Tracker",
  "Hunter",
  "Collector",
  "Radar",
  "Ace",
  "Chaser",
  "Ripper",
  "Seeker",
  "Vault",
];

export function generateSpotterHandle(seed?: string): string {
  if (seed && seed.trim().toLowerCase() === "james@jpegtown.com") {
    return "King_Bezos";
  }
  let hash = Math.floor(Math.random() * 1_000_000);
  if (seed) {
    hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash = Math.abs(hash);
  }
  const p = HANDLE_PREFIXES[hash % HANDLE_PREFIXES.length];
  const r = HANDLE_ROLES[Math.floor(hash / HANDLE_PREFIXES.length) % HANDLE_ROLES.length];
  const num = (hash % 900) + 100;
  return `${p}${r}${num}`;
}

function buildAuth() {
  const googleCreds = getGoogleOAuthCreds();
  const inferredSiteUrl =
    process.env.BETTER_AUTH_URL ||
    process.env.SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
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
      ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
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
            prompt: "select_account",
            mapProfileToUser: (profile) => ({
              name:
                profile.email?.toLowerCase() === "james@jpegtown.com"
                  ? "King_Bezos"
                  : generateSpotterHandle(profile.sub || profile.email),
              image: undefined,
            }),
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
          before: async (u) => {
            const rawName = (u.name || "").trim();
            const isGoogleOrFullName =
              Boolean(u.image) ||
              !rawName ||
              rawName.toLowerCase() === "auto" ||
              rawName.includes(" ") ||
              rawName.includes("@") ||
              rawName.toLowerCase() === (u.email || "").split("@")[0]?.toLowerCase();
            return {
              data: {
                ...u,
                name: isGoogleOrFullName ? generateSpotterHandle(u.email || rawName) : rawName,
                image: null,
              },
            };
          },
          after: async (u) => {
            const admins = [
              "james@jpegtown.com",
              ...(process.env.ADMIN_EMAILS || "")
                .split(",")
                .map((e) => e.trim().toLowerCase())
                .filter(Boolean),
            ];
            const [{ n }] = await db
              .select({ n: sql<number>`count(*)::int` })
              .from(schema.user)
              .where(eq(schema.user.role, "admin"));
            const patch: Partial<typeof schema.user.$inferInsert> = {
              image: null,
              emailVerified: true,
            };
            if (u.email.toLowerCase() === "james@jpegtown.com") {
              patch.name = "King_Bezos";
              patch.role = "admin";
            } else if (admins.includes(u.email.toLowerCase()) || n === 0) {
              patch.role = "admin";
            }
            await db.update(schema.user).set(patch).where(eq(schema.user.id, u.id));
            try {
              const { processReferralForNewUser } = await import("@/lib/referrals");
              await processReferralForNewUser(db, {
                id: u.id,
                email: u.email,
                name: patch.name ?? u.name,
              });
            } catch {}
          },
        },
      },
      session: {
        create: {
          after: async (sess) => {
            try {
              const [u] = await db.select().from(schema.user).where(eq(schema.user.id, sess.userId));
              if (u) {
                const { persistIdentityCookie } = await import("@/lib/session");
                await persistIdentityCookie(u, sess.token);
              }
            } catch {}
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

import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { getDb } from "@/db";
import { user, verification } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { isEmailProviderConfigured, sendEmail } from "@/lib/notify/channels";

export const dynamic = "force-dynamic";

export async function issueEmailVerificationCode(emailRaw: string, origin?: string) {
  const email = emailRaw.trim().toLowerCase();
  const db = await getDb();
  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) throw new Error("Account not found");
  if (u.emailVerified) return { alreadyVerified: true, delivery: "sent" as const, previewCode: null };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ident = `email-verify:${email}`;
  const expiresAt = new Date(Date.now() + 24 * 3_600_000);

  await db.delete(verification).where(eq(verification.identifier, ident));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: ident,
    value: code,
    expiresAt,
  });

  const base = origin || process.env.BETTER_AUTH_URL || process.env.SITE_URL || "http://localhost:3000";
  const verifyUrl = `${base}/verify-email?email=${encodeURIComponent(email)}&code=${code}`;
  const delivery = await sendEmail(email, {
    title: `Your PackRadar verification code: ${code}`,
    body: `Welcome to PackRadar! Enter verification code ${code} (or click the button below) to verify your email address and unlock Monthly Prize Leaderboard reputation.`,
    url: verifyUrl,
  });

  return {
    alreadyVerified: false,
    delivery,
    previewCode: isEmailProviderConfigured() ? null : code,
  };
}

const SendBody = z.object({
  email: z.string().email().optional(),
});

/** POST /api/auth/verify-email -> Send or resend 6-digit verification code */
export const POST = route(async (req) => {
  const current = await getCurrentUser();
  const b = SendBody.parse(await json(req).catch(() => ({})));
  const targetEmail = b.email || current?.email;
  if (!targetEmail) throw new Error("Email required");

  rateLimit(`verify-send:${targetEmail.toLowerCase()}`, 6, 900_000);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : undefined;

  const res = await issueEmailVerificationCode(targetEmail, origin);
  return { ok: true, ...res };
});

const VerifyBody = z.object({
  email: z.string().email().optional(),
  code: z.string().min(4).max(12),
});

/** PUT /api/auth/verify-email -> Confirm 6-digit code and mark emailVerified = true */
export const PUT = route(async (req) => {
  const current = await getCurrentUser();
  const b = VerifyBody.parse(await json(req));
  const email = (b.email || current?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Email required");

  const db = await getDb();
  const ident = `email-verify:${email}`;
  const [row] = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, ident),
        eq(verification.value, b.code.trim()),
        gt(verification.expiresAt, new Date()),
      ),
    );

  if (!row) {
    throw new Error("Invalid or expired verification code. Please request a new code.");
  }

  await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.email, email));
  await db.delete(verification).where(eq(verification.identifier, ident));

  return { ok: true, verified: true };
});

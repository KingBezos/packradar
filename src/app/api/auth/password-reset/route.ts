import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { route, json, rateLimit } from "@/lib/api";
import { getDb } from "@/db";
import { account, user, verification } from "@/db/schema";
import { isEmailProviderConfigured, sendEmail } from "@/lib/notify/channels";

export const dynamic = "force-dynamic";

const RequestBody = z.object({
  email: z.string().email(),
});

/** POST /api/auth/password-reset -> Send 6-digit reset code & link to user's email */
export const POST = route(async (req) => {
  const { email: rawEmail } = RequestBody.parse(await json(req));
  const email = rawEmail.trim().toLowerCase();
  rateLimit(`pwd-reset:${email}`, 5, 900_000);

  const db = await getDb();
  const [u] = await db.select().from(user).where(eq(user.email, email));

  // Always return a friendly response, and if user exists issue code
  if (!u) {
    return {
      ok: true,
      delivery: isEmailProviderConfigured() ? "sent" : "logged",
      previewCode: null,
      message: "If an account with that email exists, a password reset code has been sent.",
    };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ident = `pwd-reset:${email}`;
  const expiresAt = new Date(Date.now() + 3_600_000); // 1 hour

  await db.delete(verification).where(eq(verification.identifier, ident));
  await db.insert(verification).values({
    id: crypto.randomUUID(),
    identifier: ident,
    value: code,
    expiresAt,
  });

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const base = host ? `${proto}://${host}` : process.env.SITE_URL || "http://localhost:3000";
  const resetUrl = `${base}/reset-password?email=${encodeURIComponent(email)}&code=${code}`;

  const delivery = await sendEmail(email, {
    title: `PackRadar Password Reset Code: ${code}`,
    body: `We received a request to reset the password for your PackRadar account (${email}). Enter code ${code} on the reset page or click the button below. This code expires in 1 hour.`,
    url: resetUrl,
  });

  return {
    ok: true,
    delivery,
    previewCode: isEmailProviderConfigured() ? null : code,
    message: "Password reset code sent! Check your inbox.",
  };
});

const ConfirmBody = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(12),
  newPassword: z.string().min(8).max(128),
});

/** PUT /api/auth/password-reset -> Verify code and update password */
export const PUT = route(async (req) => {
  const { email: rawEmail, code, newPassword } = ConfirmBody.parse(await json(req));
  const email = rawEmail.trim().toLowerCase();
  const db = await getDb();

  const [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) throw new Error("Invalid email or reset code");

  const ident = `pwd-reset:${email}`;
  const [vRow] = await db
    .select()
    .from(verification)
    .where(
      and(
        eq(verification.identifier, ident),
        eq(verification.value, code.trim()),
        gt(verification.expiresAt, new Date()),
      ),
    );

  if (!vRow) {
    throw new Error("Invalid or expired reset code. Please request a new one.");
  }

  const hashedPassword = await hashPassword(newPassword);
  const [credAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")));

  if (credAccount) {
    await db
      .update(account)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(account.id, credAccount.id));
  } else {
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId: u.id,
      accountId: u.id,
      providerId: "credential",
      password: hashedPassword,
    });
  }

  // Completing email-based password reset also proves ownership of the email
  await db.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, u.id));
  await db.delete(verification).where(eq(verification.identifier, ident));

  return { ok: true };
});

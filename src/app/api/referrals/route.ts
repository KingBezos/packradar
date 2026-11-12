import { cookies } from "next/headers";
import { getDb } from "@/db";
import { json, route } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import {
  getUserReferralSummary,
  processReferralForNewUser,
  REFERRAL_COOKIE,
} from "@/lib/referrals";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const u = await getCurrentUser();
  if (!u) return { signedIn: false };
  const db = await getDb();
  const summary = await getUserReferralSummary(db, u.id, u.name);
  return { signedIn: true, ...summary };
});

export const POST = route(async (req) => {
  const body = ((await json(req).catch(() => ({}))) ?? {}) as {
    ref?: string;
    claim?: boolean;
  };
  const ref = (body.ref || "").trim().slice(0, 64);

  if (ref) {
    const jar = await cookies();
    jar.set(REFERRAL_COOKIE, encodeURIComponent(ref), {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }

  const u = await getCurrentUser();
  if (u && (body.claim || ref)) {
    const ageMs = u.createdAt ? Date.now() - new Date(u.createdAt).getTime() : 0;
    // Allow post-OAuth client fallback attribution within 20 minutes of account creation
    if (ageMs >= 0 && ageMs < 20 * 60 * 1000) {
      const db = await getDb();
      const res = await processReferralForNewUser(db, u, ref || undefined);
      if (res.attributed) {
        const jar = await cookies();
        jar.delete(REFERRAL_COOKIE);
      }
      return { ok: true, ...res };
    }
  }

  return { ok: true, tracked: Boolean(ref) };
});

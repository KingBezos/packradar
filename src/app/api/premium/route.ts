import { eq } from "drizzle-orm";
import { route } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { user } from "@/db/schema";

/**
 * Premium checkout placeholder. In production this will create a Stripe
 * Checkout session (STRIPE_SECRET_KEY + STRIPE_PRICE_ID) and the webhook will
 * flip `user.plan`. In development it toggles premium so features can be tested.
 */
export const POST = route(async () => {
  const u = await requireUser();
  if (process.env.STRIPE_SECRET_KEY) {
    return { error: "Stripe checkout not wired yet – coming soon" };
  }
  if (process.env.NODE_ENV === "production") throw new Error("Premium is coming soon!");
  const db = await getDb();
  const next = u.plan === "premium" ? "free" : "premium";
  await db.update(user).set({ plan: next, planExpiresAt: null }).where(eq(user.id, u.id));
  return { ok: true, plan: next, dev: true };
});

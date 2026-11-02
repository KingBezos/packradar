import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";

const Body = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const POST = route(async (req) => {
  const u = await requireUser();
  const b = Body.parse(await json(req));
  const db = await getDb();
  await db
    .insert(pushSubscriptions)
    .values({ userId: u.id, endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: u.id, p256dh: b.keys.p256dh, auth: b.keys.auth } });
  return { ok: true };
});

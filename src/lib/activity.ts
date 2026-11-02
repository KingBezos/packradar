import { and, eq, ilike, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { activity, reputationEvents, user } from "@/db/schema";

export async function logActivity(
  db: DB,
  a: { type: string; message: string; machineId?: string | null; userId?: string | null; url?: string | null },
) {
  await db.insert(activity).values({
    type: a.type,
    message: a.message,
    machineId: a.machineId ?? null,
    userId: a.userId ?? null,
    url: a.url ?? null,
  });
}

/** Reputation points & anti-spam / false-report penalties. */
export const REP = {
  observation: 2,
  observationConfirmedLater: 3,
  vote: 1,
  proposal: 2,
  firstFinder: 10,
  stockReport: 1,
  newMachine: 5,
  photoVerified: 25,
  comment: 0,
  // Penalties (negative)
  spamCooldownPenalty: -3,
  impossibleTravelPenalty: -5,
  burstSpamPenalty: -5,
  falseObservationPenalty: -4,
  discreditedProposalPenalty: -6,
} as const;

export async function addReputation(db: DB, userId: string, delta: number, reason: string) {
  if (!delta) return;
  await db.insert(reputationEvents).values({ userId, delta, reason });
  await db
    .update(user)
    .set({ reputation: sql`${user.reputation} + ${delta}` })
    .where(eq(user.id, userId));
}

/** Check if a tagged reputation event (e.g. `[slash:obs:123]`) has already been applied. */
export async function hasReputationEventTag(db: DB, userId: string, tag: string): Promise<boolean> {
  const rows = await db
    .select({ id: reputationEvents.id })
    .from(reputationEvents)
    .where(and(eq(reputationEvents.userId, userId), ilike(reputationEvents.reason, `%${tag}%`)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Drop-time engine: the DB-backed side of consensus.
 *
 * All counts (matching/conflicting observations, vote sums, supporters) are
 * recomputed from source rows each time, so results are deterministic and
 * self-healing.
 */
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import {
  dropCandidates,
  dropObservations,
  dropVotes,
  machines,
  scheduleHistory,
  user,
  type DropCandidate,
  type Machine,
} from "@/db/schema";
import {
  computeAccuracy,
  pickActiveCandidate,
  scrapedBaseConfidence,
  SOURCE_BASE_CONFIDENCE,
  voteWeight,
  type CandidateSource,
  type ScrapeEvidence,
} from "./accuracy";
import { inferTimer, observationMatches, sameTimer } from "./inference";
import { describeSchedule, type DropSchedule } from "./schedule";
import { addReputation, logActivity, REP } from "@/lib/activity";
import { evaluateObservationSafeguards, reconcileRetroactiveReputation } from "./safeguards";

/** Observations older than this no longer count (timers reset after servicing). */
export const OBSERVATION_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export function machineSchedule(m: Machine): DropSchedule | null {
  if (m.intervalMinutes == null || m.anchorMinute == null) return null;
  return {
    intervalMinutes: m.intervalMinutes,
    anchorMinute: m.anchorMinute,
    activeStartMinute: m.activeStartMinute,
    activeEndMinute: m.activeEndMinute,
    daysMask: m.daysMask,
    timezone: m.timezone,
  };
}

export function candidateSchedule(c: DropCandidate, m: Machine): DropSchedule {
  return {
    intervalMinutes: c.intervalMinutes,
    anchorMinute: c.anchorMinute,
    activeStartMinute: c.activeStartMinute ?? m.activeStartMinute,
    activeEndMinute: c.activeEndMinute ?? m.activeEndMinute,
    daysMask: c.daysMask ?? m.daysMask,
    timezone: m.timezone,
  };
}

/** Recompute every candidate's stats + accuracy and (re)select the active schedule. */
export async function recomputeMachine(db: DB, machineId: string, reason = "recompute") {
  const [m] = await db.select().from(machines).where(eq(machines.id, machineId));
  if (!m) return null;
  const cands = await db.select().from(dropCandidates).where(eq(dropCandidates.machineId, machineId));
  const since = new Date(Date.now() - OBSERVATION_WINDOW_DAYS * DAY_MS);
  const obs = await db
    .select()
    .from(dropObservations)
    .where(and(eq(dropObservations.machineId, machineId), gte(dropObservations.observedAt, since)));
  const votes = cands.length
    ? await db
        .select()
        .from(dropVotes)
        .where(
          inArray(
            dropVotes.candidateId,
            cands.map((c) => c.id),
          ),
        )
    : [];

  const now = Date.now();
  const updated: (DropCandidate & { updatedAtMs: number })[] = [];

  for (const c of cands) {
    const timer = { intervalMinutes: c.intervalMinutes, anchorMinute: c.anchorMinute, timezone: m.timezone };
    let matching = 0;
    let conflicting = 0;
    let lastCorroboration = 0;
    const supporterIds = new Set<string>();

    for (const o of obs) {
      const t = o.observedAt.getTime();
      const matches = observationMatches(timer, t);
      if (o.kind === "dropped") {
        if (matches) {
          matching++;
          lastCorroboration = Math.max(lastCorroboration, t);
          if (o.userId) supporterIds.add(o.userId);
        } else if (t >= c.createdAt.getTime() - DAY_MS || c.source !== "observed") {
          conflicting++;
        }
      } else if (o.kind === "no_drop" && matches) {
        conflicting++;
      }
    }

    let confirms = 0;
    let disputes = 0;
    for (const v of votes.filter((v) => v.candidateId === c.id)) {
      if (v.value > 0) {
        confirms += v.weight;
        supporterIds.add(v.userId);
        lastCorroboration = Math.max(lastCorroboration, v.createdAt.getTime());
      } else {
        disputes += v.weight;
      }
    }

    const accuracy = computeAccuracy({
      source: c.source as CandidateSource,
      baseConfidence: c.baseConfidence,
      verified: c.verified,
      confirms,
      disputes,
      matchingObservations: matching,
      conflictingObservations: conflicting,
      daysSinceLastCorroboration: lastCorroboration
        ? (now - lastCorroboration) / DAY_MS
        : (now - c.createdAt.getTime()) / DAY_MS,
    });

    const patch = {
      confirms,
      disputes,
      matchingObservations: matching,
      conflictingObservations: conflicting,
      supporters: supporterIds.size,
      accuracy,
      lastCorroboratedAt: lastCorroboration ? new Date(lastCorroboration) : c.lastCorroboratedAt,
    };
    await db.update(dropCandidates).set(patch).where(eq(dropCandidates.id, c.id));
    updated.push({ ...c, ...patch, updatedAtMs: (patch.lastCorroboratedAt ?? c.createdAt).getTime() });
  }

  const active = pickActiveCandidate(updated, m.activeCandidateId);
  const prev = m.activeCandidateId ? updated.find((c) => c.id === m.activeCandidateId) : undefined;

  await db
    .update(machines)
    .set(
      active
        ? {
            activeCandidateId: active.id,
            intervalMinutes: active.intervalMinutes,
            anchorMinute: active.anchorMinute,
            activeStartMinute: active.activeStartMinute ?? m.activeStartMinute,
            activeEndMinute: active.activeEndMinute ?? m.activeEndMinute,
            daysMask: active.daysMask ?? m.daysMask,
            accuracy: active.accuracy,
            scheduleSource: active.source,
            scheduleVerified: active.verified,
          }
        : {
            activeCandidateId: null,
            intervalMinutes: null,
            anchorMinute: null,
            accuracy: null,
            scheduleSource: null,
            scheduleVerified: false,
          },
    )
    .where(eq(machines.id, machineId));

  if (active && active.id !== m.activeCandidateId) {
    const toDesc = describeSchedule(candidateSchedule(active, m));
    const fromDesc = prev ? describeSchedule(candidateSchedule(prev, m)) : null;
    await db.insert(scheduleHistory).values({
      machineId,
      fromCandidateId: prev?.id ?? null,
      toCandidateId: active.id,
      fromDescription: fromDesc,
      toDescription: toDesc,
      reason,
    });
    await logActivity(db, {
      type: "schedule_change",
      machineId,
      message: fromDesc
        ? `⏱️ ${m.retailer} ${m.city} drop time updated → ${toDesc} (${Math.round(active.accuracy)}% accuracy)`
        : `⏱️ ${m.retailer} ${m.city} now has a drop time: ${toDesc}`,
      url: `/machines/${machineId}`,
    });
    const { notifyScheduleChange } = await import("@/lib/notify/dispatch");
    await notifyScheduleChange(db, machineId, `${m.retailer} ${m.city}: ${toDesc}`).catch(() => {});
  }

  // Retroactively slash false reports / discredited proposals and award +3 Rep Truth Bonuses
  await reconcileRetroactiveReputation(db, m, updated, obs, active ?? null).catch(() => {});

  return active;
}

/** "It dropped at HH:MM" (or "I was here at HH:MM and nothing dropped"). */
export async function submitObservation(
  db: DB,
  input: {
    machineId: string;
    userId: string | null;
    observedAt: Date;
    kind?: "dropped" | "no_drop";
    note?: string | null;
    source?: "user" | "scraped";
    sourceUrl?: string | null;
  },
) {
  const [m] = await db.select().from(machines).where(eq(machines.id, input.machineId));
  if (!m) throw new Error("Machine not found");
  const kind = input.kind ?? "dropped";
  const cands = await db.select().from(dropCandidates).where(eq(dropCandidates.machineId, m.id));

  // Anti-spam, impossible travel & probationary hold safeguards for user reports
  let safeguardHoldRep = false;
  let safeguardStatusMessage: string | undefined;
  if (input.userId && (input.source ?? "user") === "user") {
    const sg = await evaluateObservationSafeguards(db, {
      userId: input.userId,
      machine: m,
      observedAt: input.observedAt,
      kind,
      candidates: cands,
    });
    safeguardHoldRep = sg.holdRep;
    safeguardStatusMessage = sg.statusMessage;
  }

  const t = input.observedAt.getTime();
  const matched = cands.find((c) =>
    observationMatches({ intervalMinutes: c.intervalMinutes, anchorMinute: c.anchorMinute, timezone: m.timezone }, t),
  );
  const isFirstEver = cands.length === 0;

  await db.insert(dropObservations).values({
    machineId: m.id,
    userId: input.userId,
    observedAt: input.observedAt,
    kind,
    note: input.note ?? null,
    matchedCandidateId: kind === "dropped" ? (matched?.id ?? null) : null,
    source: input.source ?? "user",
    sourceUrl: input.sourceUrl ?? null,
  });

  // An unmatched "dropped" report may reveal a new/shifted timer → infer one.
  if (kind === "dropped" && !matched) {
    await upsertObservedCandidate(db, m, input.userId);
  }

  if (input.userId && !safeguardHoldRep) {
    await addReputation(db, input.userId, REP.observation, `drop observation on ${m.id}`);
    if (isFirstEver) await addReputation(db, input.userId, REP.firstFinder, `first finder on ${m.id}`);
  }
  await logActivity(db, {
    type: "drop_observed",
    machineId: m.id,
    userId: input.userId,
    message:
      kind === "dropped"
        ? `🟢 Drop reported at ${m.retailer} ${m.city} (${m.id})`
        : `🚫 No drop seen at ${m.retailer} ${m.city} (${m.id})`,
    url: `/machines/${m.id}`,
  });
  const active = await recomputeMachine(db, m.id, kind === "dropped" ? "community observations" : "no-drop reports");
  return active
    ? Object.assign(active, { safeguardMessage: safeguardStatusMessage, repHeld: safeguardHoldRep })
    : safeguardStatusMessage
      ? ({ id: null, accuracy: null, safeguardMessage: safeguardStatusMessage, repHeld: safeguardHoldRep } as unknown as NonNullable<typeof active> & {
          safeguardMessage?: string;
          repHeld?: boolean;
        })
      : null;
}

async function upsertObservedCandidate(db: DB, m: Machine, userId: string | null) {
  const cands = await db.select().from(dropCandidates).where(eq(dropCandidates.machineId, m.id));
  const since = new Date(Date.now() - OBSERVATION_WINDOW_DAYS * DAY_MS);
  const obs = await db
    .select()
    .from(dropObservations)
    .where(
      and(
        eq(dropObservations.machineId, m.id),
        eq(dropObservations.kind, "dropped"),
        gte(dropObservations.observedAt, since),
      ),
    )
    .orderBy(desc(dropObservations.observedAt));

  // Observations not explained by any non-observed candidate.
  const others = cands.filter((c) => c.source !== "observed");
  const unexplained = obs.filter(
    (o) =>
      !others.some((c) =>
        observationMatches(
          { intervalMinutes: c.intervalMinutes, anchorMinute: c.anchorMinute, timezone: m.timezone },
          o.observedAt.getTime(),
        ),
      ),
  );
  const inferred = inferTimer(
    unexplained.map((o) => o.observedAt.getTime()),
    m.timezone,
  );
  if (!inferred) return;

  const existing = cands.find((c) => sameTimer(c, inferred));
  if (existing) return; // the recompute will count the new observation toward it

  const observedCands = cands.filter((c) => c.source === "observed");
  // Re-use an observed candidate whose inference has drifted (keeps the list tidy).
  const reusable = observedCands.find((c) => c.intervalMinutes === inferred.intervalMinutes && c.supporters <= 1);
  if (reusable) {
    await db
      .update(dropCandidates)
      .set({ anchorMinute: inferred.anchorMinute, evidence: { inferred } })
      .where(eq(dropCandidates.id, reusable.id));
    return;
  }
  await db.insert(dropCandidates).values({
    machineId: m.id,
    intervalMinutes: inferred.intervalMinutes,
    anchorMinute: inferred.anchorMinute,
    source: "observed",
    baseConfidence: SOURCE_BASE_CONFIDENCE.observed,
    createdByUserId: userId,
    evidence: { inferred },
  });
}

async function weightFor(db: DB, userId: string) {
  const [u] = await db.select({ reputation: user.reputation, role: user.role }).from(user).where(eq(user.id, userId));
  return voteWeight(u?.reputation ?? 0, u?.role === "mod" || u?.role === "admin");
}

/** Confirm (+1) or dispute (-1) a candidate. Re-voting replaces your vote. */
export async function voteCandidate(db: DB, input: { candidateId: string; userId: string; value: 1 | -1 }) {
  const [c] = await db.select().from(dropCandidates).where(eq(dropCandidates.id, input.candidateId));
  if (!c) throw new Error("Candidate not found");
  const weight = await weightFor(db, input.userId);
  const [existing] = await db
    .select()
    .from(dropVotes)
    .where(and(eq(dropVotes.candidateId, c.id), eq(dropVotes.userId, input.userId)));
  if (existing) {
    await db.update(dropVotes).set({ value: input.value, weight }).where(eq(dropVotes.id, existing.id));
  } else {
    await db.insert(dropVotes).values({ candidateId: c.id, userId: input.userId, value: input.value, weight });
    await addReputation(db, input.userId, REP.vote, "drop-time vote");
  }
  const [m] = await db.select().from(machines).where(eq(machines.id, c.machineId));
  await logActivity(db, {
    type: "vote",
    machineId: c.machineId,
    userId: input.userId,
    message: `${input.value > 0 ? "✅ Confirmed" : "❌ Disputed"} drop time at ${m?.retailer ?? ""} ${m?.city ?? ""}`,
    url: `/machines/${c.machineId}`,
  });
  return recomputeMachine(db, c.machineId, "community votes");
}

/** Suggest a drop time. If it already exists, counts as a confirm vote. */
export async function proposeCandidate(
  db: DB,
  input: {
    machineId: string;
    userId: string;
    intervalMinutes: number;
    anchorMinute: number;
    activeStartMinute?: number | null;
    activeEndMinute?: number | null;
  },
) {
  const cands = await db.select().from(dropCandidates).where(eq(dropCandidates.machineId, input.machineId));
  const same = cands.find((c) => sameTimer(c, input));
  if (same) return voteCandidate(db, { candidateId: same.id, userId: input.userId, value: 1 });

  // Prevent a single user from spamming multiple conflicting schedule proposals on the same machine
  const myExistingProposals = cands.filter((c) => c.createdByUserId === input.userId);
  if (myExistingProposals.length >= 2) {
    await addReputation(
      db,
      input.userId,
      REP.spamCooldownPenalty,
      `Penalty: spamming multiple conflicting schedule proposals on ${input.machineId} (${REP.spamCooldownPenalty} rep)`,
    );
    throw new Error(
      `Anti-spam safeguard: You already proposed ${myExistingProposals.length} schedules on ${input.machineId}. Repeated proposal spam deducted ${Math.abs(REP.spamCooldownPenalty)} Rep.`,
    );
  }

  const [created] = await db
    .insert(dropCandidates)
    .values({
      machineId: input.machineId,
      intervalMinutes: input.intervalMinutes,
      anchorMinute: input.anchorMinute,
      activeStartMinute: input.activeStartMinute ?? null,
      activeEndMinute: input.activeEndMinute ?? null,
      source: "community",
      baseConfidence: SOURCE_BASE_CONFIDENCE.community,
      createdByUserId: input.userId,
    })
    .returning();
  await addReputation(db, input.userId, REP.proposal, `drop-time proposal on ${input.machineId}`);
  if (cands.length === 0) await addReputation(db, input.userId, REP.firstFinder, `first finder on ${input.machineId}`);
  return voteCandidate(db, { candidateId: created.id, userId: input.userId, value: 1 });
}

/** Insert/merge a scraped candidate. Agreement across sources raises base confidence. */
export async function upsertScrapedCandidate(
  db: DB,
  input: {
    machineId: string;
    intervalMinutes: number;
    anchorMinute: number;
    sourceUrl: string;
    sourceTitle?: string;
    reliability: number;
    mentionedAt: Date;
  },
) {
  const cands = await db.select().from(dropCandidates).where(eq(dropCandidates.machineId, input.machineId));
  const same = cands.find((c) => c.source === "scraped" && sameTimer(c, input));
  const ageDays = (Date.now() - input.mentionedAt.getTime()) / DAY_MS;

  if (same) {
    const ev = (same.evidence ?? {}) as { sources?: { url: string; reliability: number; ageDays: number }[] };
    const sources = ev.sources ?? [];
    if (!sources.some((s) => s.url === input.sourceUrl)) {
      sources.push({ url: input.sourceUrl, reliability: input.reliability, ageDays });
    }
    const evidence: ScrapeEvidence = {
      sourceReliability: Math.max(...sources.map((s) => s.reliability)),
      agreeingSources: sources.length,
      ageDays: Math.min(...sources.map((s) => s.ageDays)),
    };
    await db
      .update(dropCandidates)
      .set({ baseConfidence: scrapedBaseConfidence(evidence), evidence: { sources } })
      .where(eq(dropCandidates.id, same.id));
    await recomputeMachine(db, input.machineId, "new scraped evidence");
    return { created: false, id: same.id };
  }

  const [created] = await db
    .insert(dropCandidates)
    .values({
      machineId: input.machineId,
      intervalMinutes: input.intervalMinutes,
      anchorMinute: input.anchorMinute,
      source: "scraped",
      baseConfidence: scrapedBaseConfidence({
        sourceReliability: input.reliability,
        agreeingSources: 1,
        ageDays,
      }),
      sourceUrl: input.sourceUrl,
      sourceTitle: input.sourceTitle ?? null,
      evidence: { sources: [{ url: input.sourceUrl, reliability: input.reliability, ageDays }] },
    })
    .returning();
  await recomputeMachine(db, input.machineId, "scraped from the web");
  return { created: true, id: created.id };
}

/** Admin/mod: mark a candidate as verified (100% accuracy, always active). */
export async function setCandidateVerified(db: DB, candidateId: string, verified: boolean) {
  const [c] = await db
    .update(dropCandidates)
    .set({ verified })
    .where(eq(dropCandidates.id, candidateId))
    .returning();
  if (c) await recomputeMachine(db, c.machineId, verified ? "verified by moderator" : "verification removed");
  return c;
}

/**
 * Anti-Spam, Anti-Bot & False-Report Reputation Slashing Safeguards.
 *
 * Protects the Monthly Rep Prize Leaderboard (ETB / Booster Bundle / Free Packs)
 * and machine accuracy consensus from:
 *  1. Same-machine cooldown button-mashing (-3 Rep on repeated violation)
 *  2. Physically impossible travel / "teleporting" between machines (-5 Rep)
 *  3. Rapid-fire multi-machine burst spam (-5 Rep)
 *  4. Contradicting a confirmed (>=85% accuracy) schedule without corroboration
 *     (upfront Rep is held in escrow until corroborated by another collector)
 *  5. Retroactive false-report slashing (-4 to -6 Rep) when a user's reported
 *     drop observation or proposed schedule is later disproven by `no_drop`
 *     reports, community disputes, or high-confidence counter-consensus
 *  6. Retroactive Truth Bonus (+3 Rep) when a user's drop report is corroborated
 *     by other collectors
 */

import { and, desc, eq, gte, ne } from "drizzle-orm";
import type { DB } from "@/db";
import {
  dropObservations,
  machines,
  type DropCandidate,
  type DropObservation,
  type Machine,
} from "@/db/schema";
import { haversineMiles } from "@/lib/geo";
import { addReputation, hasReputationEventTag, logActivity, REP } from "@/lib/activity";
import { observationMatches } from "./inference";

/** Maximum plausible driving/travel speed between two physical machines (mph). */
export const MAX_PLAUSIBLE_SPEED_MPH = 90;
/** Minimum distance (miles) before travel-speed checks trigger (ignores same-plaza / nearby stores). */
export const MIN_TRAVEL_CHECK_MILES = 5;
/** Cooldown window (ms) for consecutive reports by the same user on the same machine. */
export const SAME_MACHINE_COOLDOWN_MS = 30 * 60_000; // 30 minutes

/**
 * Pure check for physically impossible travel ("teleportation") between two
 * machine observations.
 */
export function isImpossibleTravel(
  prev: { lat: number; lng: number; timeMs: number },
  curr: { lat: number; lng: number; timeMs: number },
): { impossible: boolean; distanceMiles: number; impliedMph: number } {
  const distanceMiles = haversineMiles(prev.lat, prev.lng, curr.lat, curr.lng);
  const elapsedHours = Math.max(0.02, Math.abs(curr.timeMs - prev.timeMs) / 3_600_000);
  const impliedMph = distanceMiles / elapsedHours;
  return {
    impossible: distanceMiles > MIN_TRAVEL_CHECK_MILES && impliedMph > MAX_PLAUSIBLE_SPEED_MPH,
    distanceMiles: Math.round(distanceMiles * 10) / 10,
    impliedMph: Math.round(impliedMph),
  };
}

export type SafeguardCheckResult = {
  /** If true, withhold instant +2 Rep until another collector corroborates the report. */
  holdRep: boolean;
  /** User-facing status/warning note explaining how Rep was handled. */
  statusMessage?: string;
};

/**
 * Run pre-submission anti-spam & anti-cheat checks for a signed-in user.
 * Throws an Error (and deducts Reputation on repeated/egregious abuse) if blocked.
 */
export async function evaluateObservationSafeguards(
  db: DB,
  input: {
    userId: string;
    machine: Machine;
    observedAt: Date;
    kind: "dropped" | "no_drop";
    candidates: DropCandidate[];
  },
): Promise<SafeguardCheckResult> {
  const now = Date.now();
  const { userId, machine, observedAt, kind, candidates } = input;

  // 1. Same-machine cooldown check (last 30 minutes)
  const cooldownSince = new Date(now - SAME_MACHINE_COOLDOWN_MS);
  const recentSameMachine = await db
    .select()
    .from(dropObservations)
    .where(
      and(
        eq(dropObservations.userId, userId),
        eq(dropObservations.machineId, machine.id),
        gte(dropObservations.createdAt, cooldownSince),
      ),
    )
    .orderBy(desc(dropObservations.createdAt));

  if (recentSameMachine.length >= 2) {
    await addReputation(
      db,
      userId,
      REP.spamCooldownPenalty,
      `Penalty: repeated cooldown spam on ${machine.id} (${REP.spamCooldownPenalty} rep)`,
    );
    await logActivity(db, {
      type: "anti_spam",
      machineId: machine.id,
      userId,
      message: `🛡️ Anti-spam penalty (${REP.spamCooldownPenalty} Rep): repeated rapid reports on ${machine.id}`,
      url: `/machines/${machine.id}`,
    });
    throw new Error(
      `Anti-spam safeguard: You already reported ${machine.id} recently. Repeated button-mashing deducted ${Math.abs(REP.spamCooldownPenalty)} Rep.`,
    );
  }
  if (recentSameMachine.length === 1) {
    const minsAgo = Math.max(1, Math.round((now - recentSameMachine[0].createdAt.getTime()) / 60_000));
    throw new Error(
      `Cooldown active: You already logged a report on ${machine.id} ${minsAgo}m ago. Please wait 30 minutes between reports on the same machine.`,
    );
  }

  // 2. Rapid-fire multi-machine burst check (last 15 minutes across distinct machines)
  const burstSince = new Date(now - 15 * 60_000);
  const recentAny = await db
    .select({
      obs: dropObservations,
      lat: machines.lat,
      lng: machines.lng,
      city: machines.city,
      retailer: machines.retailer,
    })
    .from(dropObservations)
    .innerJoin(machines, eq(machines.id, dropObservations.machineId))
    .where(
      and(
        eq(dropObservations.userId, userId),
        ne(dropObservations.machineId, machine.id),
        gte(dropObservations.createdAt, new Date(now - 90 * 60_000)),
      ),
    )
    .orderBy(desc(dropObservations.createdAt))
    .limit(10);

  const distinctBurstMachines = new Set(
    recentAny.filter((r) => r.obs.createdAt >= burstSince).map((r) => r.obs.machineId),
  );
  if (distinctBurstMachines.size >= 4) {
    await addReputation(
      db,
      userId,
      REP.burstSpamPenalty,
      `Penalty: multi-machine burst spam across ${distinctBurstMachines.size + 1} machines (${REP.burstSpamPenalty} rep)`,
    );
    throw new Error(
      `Anti-bot safeguard: Reporting across ${distinctBurstMachines.size + 1} machines in under 15 minutes triggered a ${REP.burstSpamPenalty} Rep penalty.`,
    );
  }

  // 3. Impossible Travel ("Teleportation") check against recent observations on other machines
  for (const prev of recentAny) {
    const travel = isImpossibleTravel(
      { lat: prev.lat, lng: prev.lng, timeMs: prev.obs.createdAt.getTime() },
      { lat: machine.lat, lng: machine.lng, timeMs: now },
    );
    if (travel.impossible) {
      await addReputation(
        db,
        userId,
        REP.impossibleTravelPenalty,
        `Penalty: impossible travel (${travel.distanceMiles} mi at ~${travel.impliedMph} mph from ${prev.obs.machineId} to ${machine.id})`,
      );
      await logActivity(db, {
        type: "anti_spam",
        machineId: machine.id,
        userId,
        message: `🛡️ Anti-cheat penalty (${REP.impossibleTravelPenalty} Rep): impossible travel ${travel.distanceMiles} mi between ${prev.obs.machineId} and ${machine.id}`,
        url: `/machines/${machine.id}`,
      });
      throw new Error(
        `Anti-cheat safeguard: ${machine.id} (${machine.city}) is ${travel.distanceMiles} miles from your recent report at ${prev.obs.machineId} (${prev.city}). Teleporting deducted ${Math.abs(REP.impossibleTravelPenalty)} Rep.`,
      );
    }
  }

  // 4. Probationary Hold when a report contradicts an already-confirmed (>=85% accuracy) schedule
  const activeCand = machine.activeCandidateId
    ? candidates.find((c) => c.id === machine.activeCandidateId)
    : undefined;
  if (
    kind === "dropped" &&
    activeCand &&
    (activeCand.verified || activeCand.accuracy >= 85) &&
    !observationMatches(
      {
        intervalMinutes: activeCand.intervalMinutes,
        anchorMinute: activeCand.anchorMinute,
        timezone: machine.timezone,
      },
      observedAt.getTime(),
    )
  ) {
    return {
      holdRep: true,
      statusMessage:
        "Report logged! Because this machine already has an 85%+ confirmed schedule, +Rep is held pending corroboration (+3 Rep bonus when another spotter confirms your shift; -4 Rep if disproven).",
    };
  }

  return { holdRep: false };
}

/**
 * Retroactive Reputation Reconciliation:
 * Runs automatically during `recomputeMachine` to:
 *  - Slash (-4 Rep) observations that are refuted by >=2 `no_drop` reports in the
 *    same minute window OR contradicted by a high-confidence (>=85%, >=2 supporters)
 *    schedule while their own candidate is discredited (<45% accuracy or net disputed).
 *  - Slash (-6 Rep) proposed candidates that become community-discredited
 *    (disputes >= 2 and disputes > confirms, or accuracy < 25 with disputes).
 *  - Reward (+3 Rep) Truth Bonus when a user's `dropped` observation is corroborated
 *    by at least one other collector on an 80%+ accuracy schedule.
 */
export async function reconcileRetroactiveReputation(
  db: DB,
  machine: Machine,
  updatedCandidates: DropCandidate[],
  observations: DropObservation[],
  activeCandidate: DropCandidate | null,
) {
  const noDrops = observations.filter((o) => o.kind === "no_drop");
  const drops = observations.filter((o) => o.kind === "dropped" && o.userId);

  for (const o of drops) {
    const userId = o.userId!;
    const obsTimeMs = o.observedAt.getTime();

    // Check if o matches the active candidate
    const matchesActive = activeCandidate
      ? observationMatches(
          {
            intervalMinutes: activeCandidate.intervalMinutes,
            anchorMinute: activeCandidate.anchorMinute,
            timezone: machine.timezone,
          },
          obsTimeMs,
        )
      : false;

    // 1. Corroborated Report Truth Bonus (+3 Rep)
    if (
      activeCandidate &&
      matchesActive &&
      activeCandidate.supporters >= 2 &&
      (activeCandidate.accuracy >= 80 || activeCandidate.verified)
    ) {
      const bonusTag = `[corrob:obs:${o.id}]`;
      if (!(await hasReputationEventTag(db, userId, bonusTag))) {
        await addReputation(
          db,
          userId,
          REP.observationConfirmedLater,
          `Truth bonus: drop report corroborated on ${machine.id} (+${REP.observationConfirmedLater} rep) ${bonusTag}`,
        );
      }
      continue;
    }

    // 2. False Observation Slashing (-4 Rep)
    // Case A: Directly refuted by >= 2 `no_drop` reports within +/- 4 minutes of the same minute-of-hour
    const refutingNoDrops = noDrops.filter((nd) => {
      if (nd.userId && nd.userId === userId) return false;
      const diffMinutes = Math.abs((nd.observedAt.getTime() - obsTimeMs) / 60_000) % 60;
      const wrappedDiff = Math.min(diffMinutes, 60 - diffMinutes);
      return wrappedDiff <= 4 && nd.observedAt.getTime() >= obsTimeMs - 3_600_000;
    });

    // Case B: Machine has a strongly confirmed active schedule (>=85% accuracy, >=2 supporters or verified),
    // this observation contradicts it, AND the candidate this observation belongs to is discredited/uncorroborated.
    const matchedCand = o.matchedCandidateId
      ? updatedCandidates.find((c) => c.id === o.matchedCandidateId)
      : updatedCandidates.find((c) =>
          observationMatches(
            { intervalMinutes: c.intervalMinutes, anchorMinute: c.anchorMinute, timezone: machine.timezone },
            obsTimeMs,
          ),
        );

    const contradictedByConsensus =
      activeCandidate &&
      !matchesActive &&
      (activeCandidate.verified || (activeCandidate.accuracy >= 85 && activeCandidate.supporters >= 2)) &&
      (!matchedCand ||
        matchedCand.disputes > matchedCand.confirms ||
        (matchedCand.accuracy < 45 && matchedCand.supporters <= 1 && noDrops.length >= 1));

    if (refutingNoDrops.length >= 2 || contradictedByConsensus) {
      const slashTag = `[slash:obs:${o.id}]`;
      if (!(await hasReputationEventTag(db, userId, slashTag))) {
        await addReputation(
          db,
          userId,
          REP.falseObservationPenalty,
          `Penalty: false drop report disproven on ${machine.id} (${REP.falseObservationPenalty} rep) ${slashTag}`,
        );
        await logActivity(db, {
          type: "reputation_slash",
          machineId: machine.id,
          userId,
          message: `⚖️ False drop report disproven at ${machine.retailer} ${machine.city} (${REP.falseObservationPenalty} Rep penalty)`,
          url: `/machines/${machine.id}`,
        });
      }
    }
  }

  // 3. Discredited Candidate Proposal Slashing (-6 Rep)
  for (const c of updatedCandidates) {
    if (!c.createdByUserId) continue;
    const isDiscreditedByVotes = c.disputes >= 2 && c.disputes > c.confirms;
    const isLowAccuracyDisputed = c.accuracy < 25 && (c.disputes >= 1 || c.conflictingObservations >= 2);
    const isBeatenByVerifiedConsensus =
      activeCandidate &&
      activeCandidate.id !== c.id &&
      (activeCandidate.verified || (activeCandidate.accuracy >= 88 && activeCandidate.supporters >= 2)) &&
      c.disputes > c.confirms &&
      c.supporters <= 1;

    if (isDiscreditedByVotes || isLowAccuracyDisputed || isBeatenByVerifiedConsensus) {
      const slashCandTag = `[slash:cand:${c.id}]`;
      if (!(await hasReputationEventTag(db, c.createdByUserId, slashCandTag))) {
        await addReputation(
          db,
          c.createdByUserId,
          REP.discreditedProposalPenalty,
          `Penalty: proposed schedule disproven on ${machine.id} (${REP.discreditedProposalPenalty} rep) ${slashCandTag}`,
        );
        await logActivity(db, {
          type: "reputation_slash",
          machineId: machine.id,
          userId: c.createdByUserId,
          message: `⚖️ Disproven drop schedule slashed on ${machine.retailer} ${machine.city} (${REP.discreditedProposalPenalty} Rep penalty)`,
          url: `/machines/${machine.id}`,
        });
      }
    }
  }
}

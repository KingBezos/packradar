/**
 * Accuracy meter + community consensus.
 *
 * Every machine has one or more drop-time *candidates* (scraped, community-
 * proposed, observation-derived, official). Each candidate starts with a base
 * confidence based on where it came from, then moves toward 100% as users
 * corroborate it (confirm votes, matching "it dropped at…" observations) and
 * toward 0% as users dispute it. The highest-accuracy candidate becomes the
 * machine's active schedule — so if we never find an authoritative time, the
 * time most people agree on wins automatically.
 */

export type CandidateSource =
  | "official" // authoritative (e.g. operator / admin-verified)
  | "scraped" // found on Reddit / forums / community maps
  | "community" // proposed by a user
  | "observed" // inferred from user drop observations
  | "seed"; // demo data

/** Starting confidence (0-100) by source. */
export const SOURCE_BASE_CONFIDENCE: Record<CandidateSource, number> = {
  official: 100,
  scraped: 40,
  community: 25,
  observed: 30,
  seed: 35,
};

export type ScrapeEvidence = {
  /** How reliable the source is, 0..1 (e.g. dedicated tracker 0.8, random comment 0.4). */
  sourceReliability: number;
  /** Number of independent sources that agree on the same timer. */
  agreeingSources: number;
  /** Age of the freshest mention in days. */
  ageDays: number;
};

/** Base confidence for a scraped candidate, from the evidence we found. */
export function scrapedBaseConfidence(e: ScrapeEvidence): number {
  const reliability = Math.min(1, Math.max(0, e.sourceReliability));
  let base = 20 + reliability * 35; // 20..55
  base += Math.min(4, Math.max(0, e.agreeingSources - 1)) * 7; // +7 per extra agreeing source (max +28)
  if (e.ageDays > 14) base -= Math.min(20, (e.ageDays - 14) * 0.5); // timers reset; stale info decays
  return clamp(Math.round(base), 10, 80);
}

export type CorroborationInput = {
  source: CandidateSource;
  baseConfidence: number;
  verified: boolean;
  /** Weighted confirm votes (reputation-weighted, typically 1.0 each). */
  confirms: number;
  /** Weighted dispute votes. */
  disputes: number;
  /** Observations whose time matched this timer. */
  matchingObservations: number;
  /** Observations (made while this candidate was active) that did NOT match. */
  conflictingObservations: number;
  /** Days since the last confirm/matching observation (null = never). */
  daysSinceLastCorroboration: number | null;
};

const GROWTH = 0.18;
const DECAY = 0.22;

/** Net corroboration score (positive = supported). */
export function netCorroboration(i: CorroborationInput): number {
  return (
    i.confirms * 1.0 +
    i.matchingObservations * 1.5 -
    i.disputes * 1.0 -
    i.conflictingObservations * 1.25
  );
}

/**
 * Accuracy meter, 0-100.
 *   net ≥ 0: 100 − (100 − base)·e^(−0.18·net)   → approaches 100%
 *   net < 0: base·e^(0.22·net)                   → falls toward 0%
 * Then a freshness factor: timers can reset after servicing, so support that
 * hasn't been re-confirmed in weeks gradually counts for less.
 */
export function computeAccuracy(i: CorroborationInput): number {
  if (i.verified || i.source === "official") return 100;
  const base = clamp(i.baseConfidence, 1, 99);
  const net = netCorroboration(i);
  let acc = net >= 0 ? 100 - (100 - base) * Math.exp(-GROWTH * net) : base * Math.exp(DECAY * net);

  if (i.daysSinceLastCorroboration != null && i.daysSinceLastCorroboration > 7) {
    const factor = Math.max(0.7, 1 - (i.daysSinceLastCorroboration - 7) / 125);
    acc *= factor;
  }
  // Non-verified candidates never display a perfect 100%.
  return clamp(Math.round(acc * 10) / 10, 1, 99);
}

export type RankableCandidate = {
  id: string;
  accuracy: number;
  verified: boolean;
  supporters: number; // distinct users who confirmed/observed
  updatedAtMs: number;
};

/** A challenger must beat the current schedule by this many accuracy points… */
export const SWITCH_MARGIN = 5;
/** …and be backed by at least this many distinct people. */
export const SWITCH_MIN_SUPPORTERS = 2;
/** Below this accuracy the current schedule is considered discredited (no hysteresis). */
export const DISCREDITED_ACCURACY = 25;

/**
 * Pick the active candidate:
 *  1. verified candidates always win
 *  2. otherwise highest accuracy
 *  3. ties → more distinct supporters → most recently updated
 *  4. hysteresis: an established schedule is only replaced when the challenger
 *     leads by SWITCH_MARGIN points with ≥ SWITCH_MIN_SUPPORTERS people behind
 *     it (or the current one is discredited). Prevents one troll flipping it.
 */
export function pickActiveCandidate<T extends RankableCandidate>(
  cands: T[],
  currentActiveId?: string | null,
): T | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => {
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    if (Math.abs(b.accuracy - a.accuracy) > 0.05) return b.accuracy - a.accuracy;
    if (b.supporters !== a.supporters) return b.supporters - a.supporters;
    return b.updatedAtMs - a.updatedAtMs;
  });
  const best = sorted[0];
  const current = currentActiveId ? cands.find((c) => c.id === currentActiveId) : undefined;
  if (!current || current.id === best.id || best.verified) return best;
  if (current.verified) return current;
  const discredited = current.accuracy < DISCREDITED_ACCURACY;
  const clearWinner =
    best.accuracy >= current.accuracy + SWITCH_MARGIN && best.supporters >= SWITCH_MIN_SUPPORTERS;
  return discredited || clearWinner ? best : current;
}

/**
 * Vote weight from user reputation:
 *  - Moderators: 2.0
 *  - Penalized spammers (rep <= -5): 0.05 (effectively muted from skewing accuracy)
 *  - Probationary negative rep (rep < 0): 0.2
 *  - Standard & trusted users: 1.0 baseline, up to 2.0
 */
export function voteWeight(reputation: number, isModerator = false): number {
  if (isModerator) return 2;
  if (reputation <= -5) return 0.05;
  if (reputation < 0) return 0.2;
  return clamp(1 + Math.log10(Math.max(1, reputation)) / 3, 0.5, 2);
}

export type AccuracyTier = "verified" | "high" | "medium" | "low";

export function accuracyTier(accuracy: number, verified: boolean): AccuracyTier {
  if (verified || accuracy >= 99.95) return "verified";
  if (accuracy >= 90) return "high";
  if (accuracy >= 60) return "medium";
  return "low";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

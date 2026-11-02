/**
 * Infer a machine's drop timer from raw "it dropped at HH:MM" observations,
 * and test whether a single observation corroborates a known schedule.
 */
import { localClock, type DropSchedule } from "./schedule";

/** Candidate timer intervals seen on machines, in minutes. */
export const CANDIDATE_INTERVALS = [15, 20, 30, 45, 60, 90, 120, 180, 240, 1440];
/** Default interval assumed when we have too few observations to tell. */
export const DEFAULT_INTERVAL = 60;
/** ± minutes an observation may be off and still count as a match. */
export const MATCH_TOLERANCE_MIN = 3;

function circularDistance(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period;
  return Math.min(d, period - d);
}

/** Circular mean of residues on a ring of `period` minutes. */
function circularMean(values: number[], period: number): number {
  let sx = 0;
  let sy = 0;
  for (const v of values) {
    const a = (2 * Math.PI * v) / period;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const ang = Math.atan2(sy, sx);
  const m = (ang * period) / (2 * Math.PI);
  return ((m % period) + period) % period;
}

export type InferredTimer = {
  intervalMinutes: number;
  anchorMinute: number;
  /** Fraction of observations that fit (0..1). */
  fit: number;
  /** Number of observations used. */
  sampleSize: number;
};

/**
 * Infer interval + anchor from observation timestamps (UTC ms) in a timezone.
 * Strategy: for each candidate interval compute residues (local minute mod
 * interval), find the densest cluster, and pick the LARGEST interval whose
 * fit is ≥ 0.85 (smaller divisors of the true interval also fit perfectly,
 * so "largest that still fits" recovers the real one).
 */
export function inferTimer(
  observationsMs: number[],
  timezone: string,
  tolerance = MATCH_TOLERANCE_MIN,
): InferredTimer | null {
  if (observationsMs.length === 0) return null;
  const minutes = observationsMs.map((t) => localClock(t, timezone).minuteOfDay);

  const evaluate = (interval: number) => {
    const residues = minutes.map((m) => m % interval);
    let best = { center: residues[0], members: [] as number[] };
    for (const r of residues) {
      const members = residues.filter((x) => circularDistance(x, r, interval) <= tolerance);
      if (members.length > best.members.length) best = { center: r, members };
    }
    const anchor = Math.round(circularMean(best.members, interval)) % interval;
    return { interval, anchor, fit: best.members.length / residues.length };
  };

  if (minutes.length < 3) {
    const e = evaluate(DEFAULT_INTERVAL);
    return {
      intervalMinutes: DEFAULT_INTERVAL,
      anchorMinute: e.anchor,
      fit: e.fit,
      sampleSize: minutes.length,
    };
  }

  const results = CANDIDATE_INTERVALS.map(evaluate);
  const good = results.filter((r) => r.fit >= 0.85);
  const chosen = good.length
    ? good.reduce((a, b) => (b.interval > a.interval ? b : a))
    : results.reduce((a, b) => (b.fit > a.fit ? b : a));

  return {
    intervalMinutes: chosen.interval,
    anchorMinute: chosen.anchor,
    fit: chosen.fit,
    sampleSize: minutes.length,
  };
}

/** Does an observed drop time line up with this schedule's timer? */
export function observationMatches(
  schedule: Pick<DropSchedule, "intervalMinutes" | "anchorMinute" | "timezone">,
  observedMs: number,
  tolerance = MATCH_TOLERANCE_MIN,
): boolean {
  const interval = Math.max(1, schedule.intervalMinutes);
  const m = localClock(observedMs, schedule.timezone).minuteOfDay;
  const anchor = ((schedule.anchorMinute % interval) + interval) % interval;
  return circularDistance(m % interval, anchor, interval) <= tolerance;
}

/** Two timers are "the same" if intervals equal and anchors within tolerance. */
export function sameTimer(
  a: { intervalMinutes: number; anchorMinute: number },
  b: { intervalMinutes: number; anchorMinute: number },
  tolerance = MATCH_TOLERANCE_MIN,
): boolean {
  if (a.intervalMinutes !== b.intervalMinutes) return false;
  const i = a.intervalMinutes;
  return circularDistance(a.anchorMinute % i, b.anchorMinute % i, i) <= tolerance;
}

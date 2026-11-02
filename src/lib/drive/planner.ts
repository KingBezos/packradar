/**
 * Drive Plan: pick an ordered route through vending machines so you ARRIVE
 * in time to catch as many (high-confidence) drops as possible.
 *
 * Model (orienteering with time windows):
 *  - each machine has upcoming drop instants within the horizon
 *  - a stop "catches" a drop if you arrive no later than `catchWindowMin`
 *    after it dropped (stock usually lasts a few minutes) and you don't
 *    have to wait more than `maxWaitMin` for it
 *  - waiting for an upcoming drop is allowed (you stand by the machine)
 *  - value of a catch = confidence-weighted (accuracy), so shaky times are
 *    worth less but still attempted when cheap
 *  - beam search maximizes total value, then minimizes total elapsed time
 */
import { dropTimesBetween, type DropSchedule } from "@/lib/drops/schedule";
import { haversineMiles } from "@/lib/geo";

export type PlanMachine = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  schedule: DropSchedule | null;
  accuracy: number | null; // 0-100
  verified: boolean;
};

export type PlanOptions = {
  start: { lat: number; lng: number };
  startMs: number;
  horizonMin: number; // plan length
  avgSpeedMph: number; // door-to-door average
  roadFactor: number; // road distance / straight-line
  dwellMin: number; // time spent at each machine after the drop
  maxWaitMin: number; // longest you will stand around for a drop
  catchWindowMin: number; // stock still there this long after drop
  maxStops: number;
  returnToStart: boolean;
  beamWidth: number;
};

export const DEFAULT_PLAN_OPTIONS: Omit<PlanOptions, "start" | "startMs"> = {
  horizonMin: 180,
  avgSpeedMph: 28,
  roadFactor: 1.35,
  dwellMin: 6,
  maxWaitMin: 12,
  catchWindowMin: 5,
  maxStops: 10,
  returnToStart: false,
  beamWidth: 12,
};

export type PlanStop = {
  machine: PlanMachine;
  dropMs: number; // the drop being targeted
  arriveMs: number;
  waitMin: number;
  departMs: number;
  legMiles: number;
  legMin: number;
  confidence: number; // 0..1
};

export type DrivePlan = {
  stops: PlanStop[];
  totalMiles: number;
  totalDriveMin: number;
  totalWaitMin: number;
  endMs: number;
  expectedCatches: number; // sum of confidences
  skipped: { machine: PlanMachine; reason: string }[];
};

export function travelMinutes(miles: number, o: Pick<PlanOptions, "avgSpeedMph">) {
  return (miles / o.avgSpeedMph) * 60;
}

export function confidenceOf(m: PlanMachine): number {
  if (m.verified) return 1;
  if (m.accuracy == null) return 0;
  return Math.min(0.99, Math.max(0.05, m.accuracy / 100));
}

type Node = {
  pos: { lat: number; lng: number };
  timeMs: number;
  visited: Set<string>;
  stops: PlanStop[];
  value: number;
  miles: number;
  waitMin: number;
};

const MIN = 60_000;

export function planDrive(machines: PlanMachine[], opts: PlanOptions): DrivePlan {
  const endLimit = opts.startMs + opts.horizonMin * MIN;
  const skipped: DrivePlan["skipped"] = [];

  // Pre-compute drop instants per machine.
  const drops = new Map<string, number[]>();
  const usable: PlanMachine[] = [];
  for (const m of machines) {
    if (!m.schedule) {
      skipped.push({ machine: m, reason: "No known drop time" });
      continue;
    }
    // include drops slightly before start (still inside the catch window)
    const list = dropTimesBetween(m.schedule, opts.startMs - opts.catchWindowMin * MIN, endLimit, 12);
    if (!list.length) {
      skipped.push({ machine: m, reason: "No drop within the plan window" });
      continue;
    }
    drops.set(m.id, list);
    usable.push(m);
  }

  const expand = (n: Node): Node[] => {
    const out: Node[] = [];
    if (n.stops.length >= opts.maxStops) return out;
    for (const m of usable) {
      if (n.visited.has(m.id)) continue;
      const miles = haversineMiles(n.pos.lat, n.pos.lng, m.lat, m.lng) * opts.roadFactor;
      const legMin = travelMinutes(miles, opts);
      const arriveMs = n.timeMs + legMin * MIN;
      // Choose the best feasible drop for this machine (earliest catchable).
      for (const d of drops.get(m.id)!) {
        const latestCatch = d + opts.catchWindowMin * MIN;
        if (arriveMs > latestCatch) continue; // too late for this drop
        const waitMin = Math.max(0, (d - arriveMs) / MIN);
        if (waitMin > opts.maxWaitMin) continue; // too early to bother
        if (Math.max(arriveMs, d) > endLimit) continue;
        const departMs = Math.max(arriveMs, d) + opts.dwellMin * MIN;
        const conf = confidenceOf(m);
        const stop: PlanStop = {
          machine: m,
          dropMs: d,
          arriveMs,
          waitMin,
          departMs,
          legMiles: miles,
          legMin,
          confidence: conf,
        };
        out.push({
          pos: { lat: m.lat, lng: m.lng },
          timeMs: departMs,
          visited: new Set(n.visited).add(m.id),
          stops: [...n.stops, stop],
          value: n.value + conf,
          miles: n.miles + miles,
          waitMin: n.waitMin + waitMin,
        });
        break; // earliest feasible drop only
      }
    }
    return out;
  };

  const better = (a: Node, b: Node) =>
    a.value !== b.value ? b.value - a.value : a.timeMs - b.timeMs || a.miles - b.miles;

  let beam: Node[] = [{ pos: opts.start, timeMs: opts.startMs, visited: new Set(), stops: [], value: 0, miles: 0, waitMin: 0 }];
  let best = beam[0];
  for (let depth = 0; depth < opts.maxStops; depth++) {
    const next: Node[] = [];
    for (const n of beam) next.push(...expand(n));
    if (!next.length) break;
    // Prefer states with more value per elapsed time to keep diversity.
    next.sort((a, b) => b.value / (b.timeMs - opts.startMs + MIN) - a.value / (a.timeMs - opts.startMs + MIN));
    beam = next.slice(0, opts.beamWidth * 3).sort(better).slice(0, opts.beamWidth);
    for (const n of beam) if (better(n, best) < 0) best = n;
  }

  let totalMiles = best.miles;
  let endMs = best.timeMs;
  if (opts.returnToStart && best.stops.length) {
    const last = best.stops[best.stops.length - 1].machine;
    const back = haversineMiles(last.lat, last.lng, opts.start.lat, opts.start.lng) * opts.roadFactor;
    totalMiles += back;
    endMs += travelMinutes(back, opts) * MIN;
  }

  const visitedIds = new Set(best.stops.map((s) => s.machine.id));
  for (const m of usable) {
    if (!visitedIds.has(m.id)) skipped.push({ machine: m, reason: "Can't be reached in time without missing better drops" });
  }

  return {
    stops: best.stops,
    totalMiles,
    totalDriveMin: best.stops.reduce((s, x) => s + x.legMin, 0) + (endMs - best.timeMs) / MIN,
    totalWaitMin: best.waitMin,
    endMs,
    expectedCatches: best.value,
    skipped,
  };
}

/** Google Maps directions URL (max ~9 intermediate waypoints are honored). */
export function googleMapsUrl(start: { lat: number; lng: number }, stops: { lat: number; lng: number }[], returnToStart = false) {
  if (!stops.length) return null;
  const pts = stops.slice(0, 10);
  const dest = returnToStart ? start : pts[pts.length - 1];
  const waypoints = returnToStart ? pts : pts.slice(0, -1);
  const p = new URLSearchParams({
    api: "1",
    origin: `${start.lat},${start.lng}`,
    destination: `${dest.lat},${dest.lng}`,
    travelmode: "driving",
  });
  if (waypoints.length) p.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

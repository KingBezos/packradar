/**
 * Route-Cluster & Corridor Intelligence Engine.
 *
 * Physical reality of Pokémon TCG vending machines:
 *  1. Route merchandisers service machines in geographic sequence along highway
 *     corridors, typically grouped by retail banner family (Kroger family:
 *     Fred Meyer / QFC / King Soopers / Fry's / Ralphs; Albertsons family:
 *     Safeway / Albertsons / Vons / Jewel-Osco; H-E-B; etc.).
 *  2. On most kiosk firmware revisions, the hourly/30-min drip timer is anchored
 *     to the minute the technician completes the post-restock inventory sync /
 *     reboot.
 *  3. Therefore, machines along the same route corridor exhibit predictable
 *     minute-mark offsets (drive time + ~22–28 min servicing time per kiosk).
 *  4. Furthermore, when ≥2 machines in the same corridor receive "No drop"
 *     disputes or timer shifts within 48h, the entire corridor was likely just
 *     serviced — flagging neighbors for a 2× Reputation Bounty.
 */
import { haversineMiles } from "@/lib/geo";
import { retailerKey } from "@/scrapers/extract";

export type ClusterMachineInput = {
  id: string;
  retailer: string;
  street: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  intervalMinutes: number | null;
  anchorMinute: number | null;
  accuracy: number | null;
  scheduleVerified: boolean;
};

export type RouteCorridorMember = ClusterMachineInput & {
  stopIndex: number;
  legMilesFromPrev: number;
  driveMinutesFromPrev: number;
};

export type InferredClusterSchedule = {
  machineId: string;
  corridorId: string;
  corridorName: string;
  intervalMinutes: number;
  anchorMinute: number;
  reliability: number;
  basedOnMachineIds: string[];
  explanation: string;
};

export type RouteCorridor = {
  id: string;
  name: string;
  state: string;
  family: string;
  members: RouteCorridorMember[];
  knownCount: number;
  confirmedCount: number;
  fittedServiceMinutes: number;
  direction: 1 | -1;
};

const MAX_LEG_MILES = 14;
const MAX_CORRIDOR_SIZE = 8;
const CORRIDOR_SPEED_MPH = 28;
const DEFAULT_SERVICE_MIN = 24;

export function retailFamily(retailer: string): string {
  const k = retailerKey(retailer);
  if (
    [
      "fred meyer",
      "qfc",
      "kroger",
      "king soopers",
      "fry's",
      "ralphs",
      "smith's",
      "harris teeter",
      "mariano's",
      "dillons",
      "pick 'n save",
      "city market",
      "food 4 less",
      "baker's",
      "pay less",
      "gerbes",
    ].includes(k)
  ) {
    return "Kroger / Fred Meyer";
  }
  if (
    [
      "safeway",
      "albertsons",
      "vons",
      "pavilions",
      "jewel-osco",
      "tom thumb",
      "randalls",
      "acme",
      "shaw's",
    ].includes(k)
  ) {
    return "Safeway / Albertsons";
  }
  if (k === "h-e-b") return "H-E-B";
  if (k === "meijer") return "Meijer";
  return "Regional";
}

function circularDist(a: number, b: number, period: number): number {
  const d = Math.abs(a - b) % period;
  return Math.min(d, period - d);
}

/**
 * Group machines into ordered geographic servicing corridors.
 */
export function buildRouteCorridors(allMachines: ClusterMachineInput[]): RouteCorridor[] {
  // Bucket by state + retail family so routes match real distributor territories
  const buckets = new Map<string, ClusterMachineInput[]>();
  for (const m of allMachines) {
    const fam = retailFamily(m.retailer);
    const key = `${m.state}::${fam}`;
    const list = buckets.get(key) ?? [];
    list.push(m);
    buckets.set(key, list);
  }

  const corridors: RouteCorridor[] = [];

  for (const [key, list] of buckets) {
    const [state, family] = key.split("::");
    const visited = new Set<string>();

    // Sort south-to-north, west-to-east for deterministic seed selection
    const sorted = [...list].sort((a, b) => a.lat - b.lat || a.lng - b.lng);

    for (const seed of sorted) {
      if (visited.has(seed.id)) continue;
      const chain: ClusterMachineInput[] = [seed];
      visited.add(seed.id);

      while (chain.length < MAX_CORRIDOR_SIZE) {
        const tail = chain[chain.length - 1];
        let bestNext: ClusterMachineInput | null = null;
        let bestDist = Infinity;

        for (const cand of sorted) {
          if (visited.has(cand.id)) continue;
          const d = haversineMiles(tail.lat, tail.lng, cand.lat, cand.lng);
          if (d <= MAX_LEG_MILES && d < bestDist) {
            bestDist = d;
            bestNext = cand;
          }
        }
        if (!bestNext) break;
        chain.push(bestNext);
        visited.add(bestNext.id);
      }

      if (chain.length < 2) continue;

      const members: RouteCorridorMember[] = chain.map((m, idx) => {
        const prev = idx > 0 ? chain[idx - 1] : null;
        const legMiles = prev ? haversineMiles(prev.lat, prev.lng, m.lat, m.lng) : 0;
        const driveMin = prev ? Math.max(3, Math.round((legMiles / CORRIDOR_SPEED_MPH) * 60)) : 0;
        return {
          ...m,
          stopIndex: idx,
          legMilesFromPrev: Math.round(legMiles * 10) / 10,
          driveMinutesFromPrev: driveMin,
        };
      });

      const fit = fitCorridorTiming(members);
      const cities = [...new Set(members.map((m) => m.city))];
      const cityLabel =
        cities.length === 1
          ? cities[0]
          : `${cities[0]} → ${cities[cities.length - 1]}`;
      const corridorId = `${state.toLowerCase()}-${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${members[0].id.toLowerCase()}`;

      corridors.push({
        id: corridorId,
        name: `${state} ${family} Corridor (${cityLabel})`,
        state,
        family,
        members,
        knownCount: members.filter((m) => m.intervalMinutes != null && m.anchorMinute != null).length,
        confirmedCount: members.filter((m) => m.scheduleVerified || (m.accuracy ?? 0) >= 85).length,
        fittedServiceMinutes: fit.serviceMinutes,
        direction: fit.direction,
      });
    }
  }

  return corridors;
}

/**
 * Calibrate the corridor's servicing cadence (18..32 min per kiosk, forward or reverse)
 * from the known machines in the corridor.
 */
function fitCorridorTiming(members: RouteCorridorMember[]): {
  serviceMinutes: number;
  direction: 1 | -1;
  avgError: number;
} {
  const known = members.filter(
    (m) => m.intervalMinutes != null && m.anchorMinute != null && (m.accuracy ?? 0) >= 60,
  );
  if (known.length < 2) {
    return { serviceMinutes: DEFAULT_SERVICE_MIN, direction: 1, avgError: 6 };
  }

  let bestService = DEFAULT_SERVICE_MIN;
  let bestDir: 1 | -1 = 1;
  let bestErr = Infinity;

  for (const dir of [1, -1] as const) {
    for (let svc = 18; svc <= 32; svc += 2) {
      let totalErr = 0;
      let pairs = 0;
      for (let i = 0; i < known.length - 1; i++) {
        const a = known[i];
        const b = known[i + 1];
        const period = Math.min(a.intervalMinutes!, b.intervalMinutes!, 60);
        const travel = cumulativeDriveMinutes(members, a.stopIndex, b.stopIndex);
        const stopsBetween = Math.abs(b.stopIndex - a.stopIndex);
        const delta = dir * (travel + stopsBetween * svc);
        const predicted = (((a.anchorMinute! + delta) % period) + period) % period;
        totalErr += circularDist(predicted, b.anchorMinute! % period, period);
        pairs++;
      }
      const avg = pairs > 0 ? totalErr / pairs : Infinity;
      if (avg < bestErr) {
        bestErr = avg;
        bestService = svc;
        bestDir = dir;
      }
    }
  }

  return { serviceMinutes: bestService, direction: bestDir, avgError: bestErr };
}

function cumulativeDriveMinutes(members: RouteCorridorMember[], fromIdx: number, toIdx: number): number {
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  let sum = 0;
  for (let i = lo + 1; i <= hi; i++) {
    sum += members[i].driveMinutesFromPrev;
  }
  return sum;
}

/**
 * Use Route-Cluster Intelligence to infer drop schedules for unknown or low-confidence
 * machines along active servicing corridors.
 */
export function inferCorridorSchedules(corridors: RouteCorridor[]): InferredClusterSchedule[] {
  const out: InferredClusterSchedule[] = [];

  for (const c of corridors) {
    const anchors = c.members.filter(
      (m) =>
        m.intervalMinutes != null &&
        m.anchorMinute != null &&
        (m.scheduleVerified || (m.accuracy ?? 0) >= 65),
    );
    if (anchors.length === 0) continue;

    // Dominant interval in this corridor (typically 60m or 30m)
    const intervalCounts = new Map<number, number>();
    for (const a of anchors) {
      const iv = a.intervalMinutes!;
      intervalCounts.set(iv, (intervalCounts.get(iv) ?? 0) + 1);
    }
    const dominantInterval = [...intervalCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    for (const target of c.members) {
      // Only infer for unknown machines or low-accuracy unconfirmed machines (<55%)
      if (target.intervalMinutes != null && (target.accuracy ?? 0) >= 55) continue;

      // Find nearest high-confidence reference machine(s) in the same corridor
      const sortedRefs = [...anchors]
        .filter((a) => a.id !== target.id)
        .sort((a, b) => Math.abs(a.stopIndex - target.stopIndex) - Math.abs(b.stopIndex - target.stopIndex));

      if (sortedRefs.length === 0) continue;
      const nearest = sortedRefs[0];
      const stopDelta = target.stopIndex - nearest.stopIndex;
      const driveMin = cumulativeDriveMinutes(c.members, nearest.stopIndex, target.stopIndex);
      const offsetMinutes =
        Math.sign(stopDelta) * c.direction * (driveMin + Math.abs(stopDelta) * c.fittedServiceMinutes);

      const interval = dominantInterval;
      const inferredAnchor = (((nearest.anchorMinute! + offsetMinutes) % interval) + interval) % interval;

      // Reliability scales with how many confirmed machines anchor this corridor and how close the neighbor is
      const proximityBoost = Math.max(0, 0.12 - Math.abs(stopDelta) * 0.03);
      const multiAnchorBoost = Math.min(0.18, (anchors.length - 1) * 0.06);
      const reliability = Math.min(0.88, 0.62 + proximityBoost + multiAnchorBoost);

      out.push({
        machineId: target.id,
        corridorId: c.id,
        corridorName: c.name,
        intervalMinutes: interval,
        anchorMinute: inferredAnchor,
        reliability,
        basedOnMachineIds: sortedRefs.slice(0, 3).map((r) => r.id),
        explanation: `Corridor offset from ${nearest.retailer} ${nearest.city} (${nearest.id} @ :${String(nearest.anchorMinute).padStart(2, "0")}) · ${driveMin}m drive + ${Math.abs(stopDelta) * c.fittedServiceMinutes}m route service cadence`,
      });
    }
  }

  return out;
}

/**
 * Route-Cluster Intelligence Adapter.
 *
 * Uses highway corridor topology + route technician servicing cadence to:
 *  1. Group all active machines into regional retail servicing corridors
 *     (e.g. "OR Safeway / Albertsons Corridor (Canby → Gladstone → Portland)").
 *  2. Calibrate the technician's stop-to-stop cadence from confirmed machines
 *     in each corridor and propagate inferred drop timers onto neighboring
 *     unknown/unconfirmed machines along the same route.
 *  3. Detect recently serviced corridors where ≥2 machines reported no-drop or
 *     timer shifts, flagging the corridor for a 2× Reputation Bounty.
 */
import { gte, ne } from "drizzle-orm";
import { dropObservations, machines, settings } from "@/db/schema";
import { buildRouteCorridors, inferCorridorSchedules } from "@/lib/drops/clusters";
import { submitObservation, upsertScrapedCandidate } from "@/lib/drops/engine";
import type { Adapter } from "../types";

export const clusterIntel: Adapter = {
  name: "cluster-intel",
  label: "Route-Cluster Corridor Intelligence",
  description:
    "Infers drop times along highway servicing corridors from confirmed neighbor machines and detects route resets.",
  daily: true,
  async run({ db, log }) {
    const rows = await db
      .select({
        id: machines.id,
        retailer: machines.retailer,
        street: machines.street,
        city: machines.city,
        state: machines.state,
        lat: machines.lat,
        lng: machines.lng,
        intervalMinutes: machines.intervalMinutes,
        anchorMinute: machines.anchorMinute,
        accuracy: machines.accuracy,
        scheduleVerified: machines.scheduleVerified,
      })
      .from(machines)
      .where(ne(machines.status, "removed"));

    const corridors = buildRouteCorridors(rows);
    log(`Built ${corridors.length} regional servicing corridors across ${rows.length} machines`);

    const inferences = inferCorridorSchedules(corridors);
    log(`Generated ${inferences.length} corridor-propagated drop-time predictions`);

    let created = 0;
    let updated = 0;
    const now = new Date();

    for (const inf of inferences) {
      const r = await upsertScrapedCandidate(db, {
        machineId: inf.machineId,
        intervalMinutes: inf.intervalMinutes,
        anchorMinute: inf.anchorMinute,
        sourceUrl: `/locations/${inf.corridorId.split("-")[0]}#${inf.corridorId}`,
        sourceTitle: `Cluster Intel · ${inf.explanation}`.slice(0, 200),
        reliability: inf.reliability,
        mentionedAt: now,
      });
      if (r.created) created++;
      else updated++;

      if (inf.basedOnMachineIds.length >= 2) {
        const obsDate = new Date(now);
        obsDate.setMinutes(inf.anchorMinute, 15, 0);
        await submitObservation(db, {
          machineId: inf.machineId,
          userId: null,
          observedAt: obsDate,
          kind: "dropped",
          note: `Corridor-synchronized with ${inf.basedOnMachineIds.join(", ")}`,
          source: "scraped",
        }).catch(() => {});
      }
    }

    // Detect corridors that were recently serviced (≥2 no_drop observations in last 48h)
    const since48h = new Date(Date.now() - 48 * 3_600_000);
    const recentObs = await db
      .select({
        machineId: dropObservations.machineId,
        kind: dropObservations.kind,
      })
      .from(dropObservations)
      .where(gte(dropObservations.observedAt, since48h));

    const noDropCountByMachine = new Map<string, number>();
    for (const o of recentObs) {
      if (o.kind === "no_drop") {
        noDropCountByMachine.set(o.machineId, (noDropCountByMachine.get(o.machineId) ?? 0) + 1);
      }
    }

    const servicedCorridorIds: string[] = [];
    const bountyMachineIds: string[] = [];
    for (const c of corridors) {
      const disputedStops = c.members.filter((m) => (noDropCountByMachine.get(m.id) ?? 0) > 0);
      if (disputedStops.length >= 2) {
        servicedCorridorIds.push(c.id);
        for (const m of c.members) bountyMachineIds.push(m.id);
        log(`Route reset detected on ${c.name} (${disputedStops.length} stops shifted) → 2× Rep Bounty active`);
      }
    }

    // Persist corridor metadata & active bounties in settings for instant UI lookup
    const summary = {
      updatedAt: now.toISOString(),
      corridorCount: corridors.length,
      servicedCorridorIds,
      bountyMachineIds,
      corridors: corridors.slice(0, 80).map((c) => ({
        id: c.id,
        name: c.name,
        state: c.state,
        family: c.family,
        stopIds: c.members.map((m) => m.id),
        knownCount: c.knownCount,
        confirmedCount: c.confirmedCount,
        fittedServiceMinutes: c.fittedServiceMinutes,
      })),
    };

    await db
      .insert(settings)
      .values({ key: "clusterIntel", value: summary })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: summary, updatedAt: new Date() },
      });

    return {
      found: inferences.length,
      created,
      updated,
      note: `${corridors.length} route corridors mapped · ${inferences.length} schedules propagated · ${servicedCorridorIds.length} route resets flagged`,
    };
  },
};

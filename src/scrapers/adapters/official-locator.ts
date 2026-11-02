/**
 * Official Pokémon Vending Machine Locator (api.vending.prod.pokemon.com).
 *
 * The API returns at most 20 machines per bounding box, so we tile the US and
 * recursively split any box that comes back full. Requests are throttled
 * because the API sits behind Incapsula and blocks bursts.
 *
 * Modes:
 *   metros (default for manual runs) – ~30 major metros, fast (~2-4 min)
 *   full   (daily job)               – whole US incl. AK/HI (can take 30-60 min)
 */
import { and, eq, lt } from "drizzle-orm";
import { machines } from "@/db/schema";
import { scrapeFetch } from "../http";
import type { Adapter } from "../types";
import { upsertOfficialMachine, type OfficialMachine } from "@/lib/machines";

const API = "https://api.vending.prod.pokemon.com/v1/machines";
export const CAP = 20;
export const MIN_SPAN = 0.02; // degrees; stop subdividing below ~1.3 miles

export type Box = { swLat: number; swLng: number; neLat: number; neLng: number };

export const METROS: [string, number, number][] = [
  ["Seattle", 47.61, -122.33], ["Portland", 45.52, -122.68], ["San Francisco", 37.77, -122.42],
  ["San Jose", 37.34, -121.89], ["Sacramento", 38.58, -121.49], ["Los Angeles", 34.05, -118.25],
  ["San Diego", 32.72, -117.16], ["Las Vegas", 36.17, -115.14], ["Phoenix", 33.45, -112.07],
  ["Tucson", 32.22, -110.97], ["Salt Lake City", 40.76, -111.89], ["Boise", 43.62, -116.2],
  ["Denver", 39.74, -104.99], ["Albuquerque", 35.08, -106.65], ["Dallas", 32.78, -96.8],
  ["Fort Worth", 32.75, -97.33], ["Houston", 29.76, -95.37], ["Austin", 30.27, -97.74],
  ["San Antonio", 29.42, -98.49], ["Chicago", 41.88, -87.63], ["Indianapolis", 39.77, -86.16],
  ["Cincinnati", 39.1, -84.51], ["Columbus", 39.96, -83.0], ["Detroit", 42.33, -83.05],
  ["Louisville", 38.25, -85.76], ["Nashville", 36.16, -86.78], ["Memphis", 35.15, -90.05],
  ["Atlanta", 33.75, -84.39], ["Charlotte", 35.23, -80.84], ["Raleigh", 35.78, -78.64],
  ["Richmond", 37.54, -77.44], ["Washington", 38.9, -77.04], ["Baltimore", 39.29, -76.61],
  ["Philadelphia", 39.95, -75.17], ["New York", 40.71, -74.0], ["Boston", 42.36, -71.06],
  ["Miami", 25.76, -80.19], ["Orlando", 28.54, -81.38], ["Tampa", 27.95, -82.46],
  ["Minneapolis", 44.98, -93.27], ["Kansas City", 39.1, -94.58], ["St. Louis", 38.63, -90.2],
  ["Anchorage", 61.22, -149.9], ["Honolulu", 21.31, -157.86],
];

const FULL_REGIONS: Box[] = [
  { swLat: 24.4, swLng: -125.0, neLat: 49.5, neLng: -66.9 }, // contiguous US
  { swLat: 51.0, swLng: -170.0, neLat: 71.5, neLng: -129.9 }, // Alaska
  { swLat: 18.8, swLng: -160.5, neLat: 22.4, neLng: -154.7 }, // Hawaii
];

function tile(box: Box, step: number): Box[] {
  const out: Box[] = [];
  for (let lat = box.swLat; lat < box.neLat; lat += step) {
    for (let lng = box.swLng; lng < box.neLng; lng += step) {
      out.push({ swLat: lat, swLng: lng, neLat: Math.min(lat + step, box.neLat), neLng: Math.min(lng + step, box.neLng) });
    }
  }
  return out;
}

export function split(b: Box): Box[] {
  const midLat = (b.swLat + b.neLat) / 2;
  const midLng = (b.swLng + b.neLng) / 2;
  return [
    { swLat: b.swLat, swLng: b.swLng, neLat: midLat, neLng: midLng },
    { swLat: b.swLat, swLng: midLng, neLat: midLat, neLng: b.neLng },
    { swLat: midLat, swLng: b.swLng, neLat: b.neLat, neLng: midLng },
    { swLat: midLat, swLng: midLng, neLat: b.neLat, neLng: b.neLng },
  ];
}

export async function query(b: Box): Promise<OfficialMachine[]> {
  const url = `${API}?swLat=${b.swLat.toFixed(4)}&swLng=${b.swLng.toFixed(4)}&neLat=${b.neLat.toFixed(4)}&neLng=${b.neLng.toFixed(4)}&unit=mi`;
  const res = await scrapeFetch(url, {
    minIntervalMs: Number(process.env.OFFICIAL_LOCATOR_DELAY_MS ?? 3000),
    retries: 3,
    headers: {
      Origin: "https://vending.pokemon.com",
      Referer: "https://vending.pokemon.com/",
      Accept: "application/json",
    },
  });
  const j = (await res.json()) as { machines?: OfficialMachine[] };
  return j.machines ?? [];
}

export const officialLocator: Adapter = {
  name: "official-locator",
  label: "Official Vending Locator",
  description: "Pulls every machine location from the official Pokémon vending locator API (adaptive tiling).",
  daily: true,
  async run({ db, log, options }) {
    const mode = (options.mode as string) ?? "metros";
    const seen = new Map<string, OfficialMachine>();
    let requests = 0;
    let errors = 0;
    const maxRequests = Number(options.maxRequests ?? (mode === "full" ? 4000 : 400));

    const queue: Box[] =
      mode === "full"
        ? FULL_REGIONS.flatMap((r) => tile(r, 2))
        : METROS.map(([, lat, lng]) => ({ swLat: lat - 0.4, swLng: lng - 0.5, neLat: lat + 0.4, neLng: lng + 0.5 }));

    log(`mode=${mode}, initial boxes=${queue.length}`);
    while (queue.length && requests < maxRequests) {
      const b = queue.shift()!;
      requests++;
      try {
        const found = await query(b);
        for (const m of found) seen.set(m.id, m);
        if (found.length >= CAP && b.neLat - b.swLat > MIN_SPAN) queue.unshift(...split(b));
      } catch (e) {
        errors++;
        log(`box ${b.swLat.toFixed(2)},${b.swLng.toFixed(2)} failed: ${(e as Error).message}`);
        if (errors > 25 && errors > requests * 0.5) {
          log("too many errors (likely blocked) – stopping early");
          break;
        }
      }
      if (requests % 25 === 0) log(`${requests} requests, ${seen.size} machines so far, ${queue.length} boxes queued`);
    }

    let created = 0;
    let updated = 0;
    for (const m of seen.values()) {
      const r = await upsertOfficialMachine(db, m, { logNew: true });
      if (r === "created") created++;
      else if (r === "updated") updated++;
    }

    // After a complete full scan, machines unseen for 7+ days are marked removed.
    const complete = mode === "full" && queue.length === 0 && errors === 0;
    if (complete) {
      const cutoff = new Date(Date.now() - 7 * 86_400_000);
      await db
        .update(machines)
        .set({ status: "removed" })
        .where(and(eq(machines.source, "official"), eq(machines.status, "active"), lt(machines.lastSeenOfficialAt, cutoff)));
    }

    log(`done: ${requests} requests, ${errors} errors, ${seen.size} machines (${created} new)`);
    return {
      found: seen.size,
      created,
      updated,
      status: errors > 0 || queue.length > 0 ? "partial" : "success",
      note: `${requests} requests${queue.length ? `, ${queue.length} boxes left` : ""}`,
    };
  },
};

/**
 * On-demand area refresh: when someone searches a place, make sure we have
 * every official machine around it (the locator caps responses at 20 per box,
 * so full boxes are split recursively). Cached per ~0.25° cell for 12 hours.
 */
import type { DB } from "@/db";
import { upsertOfficialMachine, type OfficialMachine } from "@/lib/machines";
import { CAP, MIN_SPAN, query, split, type Box } from "./adapters/official-locator";

const TTL_MS = 12 * 3_600_000;
const HALF = 0.3; // ~20 miles each way
const MAX_REQUESTS = 14;
const MAX_MS = 15_000;

const g = globalThis as unknown as { __prAreaCache?: Map<string, number>; __prAreaInflight?: Map<string, Promise<number>> };
const cache = (g.__prAreaCache ??= new Map());
const inflight = (g.__prAreaInflight ??= new Map());

const cellKey = (lat: number, lng: number) => `${Math.round(lat * 4) / 4},${Math.round(lng * 4) / 4}`;

/** Returns the number of newly added machines. Never throws. */
export function refreshArea(db: DB, lat: number, lng: number): Promise<number> {
  const key = cellKey(lat, lng);
  const last = cache.get(key);
  if (last && Date.now() - last < TTL_MS) return Promise.resolve(0);
  const running = inflight.get(key);
  if (running) return running;

  const p = (async () => {
    const started = Date.now();
    const seen = new Map<string, OfficialMachine>();
    const queue: Box[] = [{ swLat: lat - HALF, swLng: lng - HALF * 1.3, neLat: lat + HALF, neLng: lng + HALF * 1.3 }];
    let requests = 0;
    let failed = false;
    while (queue.length && requests < MAX_REQUESTS && Date.now() - started < MAX_MS) {
      const b = queue.shift()!;
      requests++;
      try {
        const found = await query(b);
        for (const m of found) seen.set(m.id, m);
        if (found.length >= CAP && b.neLat - b.swLat > MIN_SPAN) queue.unshift(...split(b));
      } catch {
        failed = true;
        break;
      }
    }
    let created = 0;
    for (const m of seen.values()) {
      if ((await upsertOfficialMachine(db, m, { logNew: true })) === "created") created++;
    }
    // Only cache complete, error-free refreshes so partial ones retry sooner.
    if (!failed && !queue.length) cache.set(key, Date.now());
    else cache.set(key, Date.now() - TTL_MS + 10 * 60_000); // retry in 10 min
    return created;
  })()
    .catch(() => 0)
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

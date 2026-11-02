import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { scrapeRuns, settings } from "@/db/schema";
import type { Adapter } from "./types";
import { officialLocator } from "./adapters/official-locator";
import { redditDropTimes } from "./adapters/reddit";
import { youtubeDropMiner } from "./adapters/youtube";
import { clusterIntel } from "./adapters/cluster-intel";
import { newsFeeds } from "./adapters/news";
import { serebiiReleases } from "./adapters/releases";
import { retailStock } from "./adapters/retail";
import { dailyReport } from "./adapters/daily-report";
import { qaAuditor } from "./adapters/qa-auditor";
import { discordOutreach } from "./adapters/discord-outreach";

/** Order matters for the daily job: locations → social/video drop times → cluster propagation → releases → retail → news → discord outreach → qa → report. */
export const ADAPTERS: Adapter[] = [
  officialLocator,
  redditDropTimes,
  youtubeDropMiner,
  clusterIntel,
  serebiiReleases,
  retailStock,
  newsFeeds,
  discordOutreach,
  qaAuditor,
  dailyReport,
];

export function getAdapter(name: string) {
  return ADAPTERS.find((a) => a.name === name);
}

const g = globalThis as unknown as { __packradarRunning?: Set<string> };
const running = (g.__packradarRunning ??= new Set<string>());

export function isRunning(name: string) {
  return running.has(name);
}

export async function runAdapter(name: string, options: Record<string, unknown> = {}) {
  const adapter = getAdapter(name);
  if (!adapter) throw new Error(`Unknown adapter ${name}`);
  if (running.has(name)) return { skipped: true as const };
  running.add(name);
  const db = await getDb();
  const [run] = await db.insert(scrapeRuns).values({ adapter: name }).returning();
  const logs: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${msg}`;
    logs.push(line);
    if (process.env.NODE_ENV !== "test") console.log(`[scrape:${name}] ${msg}`);
  };
  try {
    const r = await adapter.run({ db, log, options });
    await db
      .update(scrapeRuns)
      .set({
        status: r.status ?? "success",
        finishedAt: new Date(),
        itemsFound: r.found,
        itemsCreated: r.created,
        itemsUpdated: r.updated,
        log: [...logs, r.note ? `note: ${r.note}` : ""].join("\n").slice(-20000),
      })
      .where(eq(scrapeRuns.id, run.id));
    return { skipped: false as const, ...r };
  } catch (e) {
    log(`FAILED: ${(e as Error).stack ?? e}`);
    await db
      .update(scrapeRuns)
      .set({ status: "failed", finishedAt: new Date(), error: (e as Error).message, log: logs.join("\n").slice(-20000) })
      .where(eq(scrapeRuns.id, run.id));
    return { skipped: false as const, found: 0, created: 0, updated: 0, error: (e as Error).message };
  } finally {
    running.delete(name);
  }
}

/** The daily job: every daily adapter in order. */
export async function runDailyJob() {
  const db = await getDb();
  const results: Record<string, unknown> = {};
  for (const a of ADAPTERS.filter((x) => x.daily)) {
    const opts = a.name === "official-locator" ? { mode: process.env.OFFICIAL_SCAN_MODE ?? "full" } : {};
    results[a.name] = await runAdapter(a.name, opts);
  }
  await db
    .insert(settings)
    .values({ key: "lastDailyRun", value: { at: new Date().toISOString(), results } })
    .onConflictDoUpdate({ target: settings.key, set: { value: { at: new Date().toISOString(), results } } });
  return results;
}

export async function latestRuns(limit = 30) {
  const db = await getDb();
  return db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.startedAt)).limit(limit);
}

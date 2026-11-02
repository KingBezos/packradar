/**
 * Server boot: migrations → first-run seed → background schedulers.
 *
 *  - every minute:   drop alerts ("machine X drops in 5 min")
 *  - daily (6 AM PT): full scrape → drop times → releases → retail → news → Daily Drop Report
 *  - every 2 hours:  news + retail refresh (keeps the site feeling live)
 *
 * In production behind a serverless host, disable with ENABLE_CRON=false and
 * hit /api/cron/* from an external scheduler instead.
 */
import { ensureMigrated, getDb } from "@/db";

const g = globalThis as unknown as { __packradarBooted?: Promise<void> };

export function boot() {
  if (!g.__packradarBooted) g.__packradarBooted = doBoot();
  return g.__packradarBooted;
}

async function doBoot() {
  await ensureMigrated();
  const db = await getDb();
  const { seedIfEmpty } = await import("@/db/seed");
  const seeded = await seedIfEmpty(db);

  if (process.env.ENABLE_CRON === "false") return;
  const cron = (await import("node-cron")).default;
  const { runDropAlerts } = await import("@/lib/notify/dispatch");
  const { runAdapter, runDailyJob } = await import("@/scrapers/runner");
  const tz = process.env.DAILY_JOB_TZ || "America/Los_Angeles";

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        await runDropAlerts(db);
      } catch (e) {
        console.error("[cron] drop alerts failed", e);
      }
    },
    { name: "drop-alerts", noOverlap: true },
  );

  cron.schedule(
    process.env.DAILY_JOB_CRON || "0 6 * * *",
    async () => {
      console.log("[cron] daily job starting");
      await runDailyJob().catch((e) => console.error("[cron] daily job failed", e));
    },
    { name: "daily-job", timezone: tz, noOverlap: true },
  );

  cron.schedule(
    "15 */2 * * *",
    async () => {
      await runAdapter("news-feeds").catch(() => {});
      await runAdapter("retail-stock").catch(() => {});
    },
    { name: "refresh", timezone: tz, noOverlap: true },
  );

  // Fresh install: pull live news/releases & run corridor intelligence right away (non-blocking).
  if (seeded && process.env.RUN_SCRAPERS_ON_BOOT !== "false") {
    void (async () => {
      await runAdapter("youtube-drop-times").catch(() => {});
      await runAdapter("cluster-intel").catch(() => {});
      await runAdapter("serebii-releases").catch(() => {});
      await runAdapter("news-feeds").catch(() => {});
      await runAdapter("daily-report").catch(() => {});
    })();
  }
  console.log("[boot] PackRadar ready (cron enabled)");
}

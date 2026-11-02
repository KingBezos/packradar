/**
 * Server boot: migrations → first-run seed → lightweight background schedulers.
 *
 *  - every 5 minutes: drop alerts ("machine X drops in N min")
 *  - 4× daily (every 6 hours): retail MSRP stock verifier + Reddit/Discord/Facebook upcoming drop intel + news
 *  - daily (4 AM PT): release calendar refresh
 *
 * Note: We do NOT run heavy scrapers on server boot because `seedIfEmpty` already
 * bulk-loads all 610 machines, 385 calibrated schedules, retail catalog, and initial news/intel.
 * This keeps startup RAM well under 250 MB on 512 MB free-tier containers (Render, Railway, etc.).
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

  if (process.env.ENABLE_CRON === "false") return;
  const cron = (await import("node-cron")).default;
  const { runDropAlerts } = await import("@/lib/notify/dispatch");
  const { runAdapter } = await import("@/scrapers/runner");
  const tz = process.env.DAILY_JOB_TZ || "America/Los_Angeles";

  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        await runDropAlerts(db);
      } catch (e) {
        console.error("[cron] drop alerts failed", e);
      }
    },
    { name: "drop-alerts", noOverlap: true },
  );

  // Every 6 hours: verify actual retailer stock, write 6-hour Pokémon news articles, and run QA auditor
  cron.schedule(
    process.env.RETAIL_SCAN_CRON || "0 */6 * * *",
    async () => {
      await runAdapter("retail-stock").catch(() => {});
      await runAdapter("news-feeds").catch(() => {});
      await runAdapter("qa-auditor").catch(() => {});
    },
    { name: "retail-and-news-6h", timezone: tz, noOverlap: true },
  );

  // Hourly background site QA & link auditor worker bot
  cron.schedule(
    "15 * * * *",
    async () => {
      await runAdapter("qa-auditor").catch(() => {});
    },
    { name: "hourly-qa-auditor", timezone: tz, noOverlap: true },
  );

  // Run lightweight QA self-heal & baseline news writer shortly after startup
  setTimeout(() => {
    runAdapter("qa-auditor").catch(() => {});
    runAdapter("news-feeds", { perSource: 4, ai: false }).catch(() => {});
  }, 2500);

  console.log("[boot] PackRadar ready (low-memory mode, continuous retail/news/QA bots active)");
}

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
  const { prewarmMetroCorridors } = await import("@/lib/queries");
  void prewarmMetroCorridors().catch(() => {});

  if (process.env.ENABLE_CRON === "false") return;
  const cron = (await import("node-cron")).default;
  const { runDropAlerts } = await import("@/lib/notify/dispatch");
  const { runAdapter } = await import("@/scrapers/runner");
  const tz = process.env.DAILY_JOB_TZ || "America/Los_Angeles";

  // Every minute: keep the Top 15 Metro Corridors & map machines pre-warmed in RAM (<40ms mobile response)
  cron.schedule(
    "* * * * *",
    async () => {
      await prewarmMetroCorridors().catch(() => {});
    },
    { name: "prewarm-metro-corridors", noOverlap: true },
  );

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

  // Every 6 hours: verify actual retailer stock, write 6-hour Pokémon news articles, run Discord Outreach Worker, QA auditor, and VoltScoutBot daily user worker
  cron.schedule(
    process.env.RETAIL_SCAN_CRON || "0 */6 * * *",
    async () => {
      await runAdapter("retail-stock").catch(() => {});
      await runAdapter("news-feeds").catch(() => {});
      await runAdapter("discord-outreach").catch(() => {});
      await runAdapter("qa-auditor").catch(() => {});
      await runAdapter("worker-user-bot").catch(() => {});
    },
    { name: "retail-and-news-6h", timezone: tz, noOverlap: true },
  );

  // Every 2 hours: run Autonomous Discord Conversational & Group Outreach Worker
  cron.schedule(
    "30 */2 * * *",
    async () => {
      await runAdapter("discord-outreach").catch(() => {});
    },
    { name: "discord-outreach-2h", timezone: tz, noOverlap: true },
  );

  // Hourly background site QA & link auditor worker bot
  cron.schedule(
    "15 * * * *",
    async () => {
      await runAdapter("qa-auditor").catch(() => {});
    },
    { name: "hourly-qa-auditor", timezone: tz, noOverlap: true },
  );

  // Run lightweight QA self-heal, baseline news writer, Discord outreach bot, and VoltScoutBot user worker shortly after startup
  setTimeout(() => {
    runAdapter("qa-auditor").catch(() => {});
    runAdapter("news-feeds", { perSource: 4, ai: false }).catch(() => {});
    runAdapter("discord-outreach").catch(() => {});
    runAdapter("worker-user-bot").catch(() => {});
  }, 2500);

  console.log("[boot] PackRadar ready (low-memory mode, continuous retail/news/QA bots active)");
}

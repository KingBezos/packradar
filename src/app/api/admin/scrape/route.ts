import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { ADAPTERS, getAdapter, isRunning, latestRuns, runAdapter, runDailyJob } from "@/scrapers/runner";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireRole(["admin", "mod"]);
  return {
    adapters: ADAPTERS.map((a) => ({ name: a.name, label: a.label, description: a.description, daily: a.daily, running: isRunning(a.name) })),
    runs: await latestRuns(40),
  };
});

const Body = z.object({
  adapter: z.string(),
  options: z.record(z.string(), z.unknown()).optional(),
});

/** Kick off a scraper in the background (returns immediately). */
export const POST = route(async (req) => {
  await requireRole(["admin"]);
  const b = Body.parse(await json(req));
  if (b.adapter === "daily") {
    void runDailyJob();
    return { started: "daily" };
  }
  if (!getAdapter(b.adapter)) throw new Error("Unknown adapter");
  if (isRunning(b.adapter)) return { started: false, reason: "already running" };
  void runAdapter(b.adapter, b.options ?? {});
  return { started: b.adapter };
});

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings } from "@/db/schema";
import { route, rateLimit } from "@/lib/api";
import { runAdapter } from "@/scrapers/runner";

export const dynamic = "force-dynamic";

/** Trigger an on-demand 4× daily retail stock verification & community rumor scan. */
export const POST = route(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  rateLimit(`drops-scan:${ip}`, 6, 3600_000);
  const res = await runAdapter("retail-stock");
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, "retailUpcomingIntel"));
  const val = (row?.value ?? null) as { lastScanAt?: string; items?: unknown[] } | null;
  const lastScanAt = val?.lastScanAt ?? new Date().toISOString();
  const nextScanAt = new Date(new Date(lastScanAt).getTime() + 6 * 3600_000).toISOString();
  return {
    ok: true,
    scan: res,
    lastScanAt,
    nextScanAt,
    intelCount: val?.items?.length ?? 0,
  };
});

import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { runDropAlerts } from "@/lib/notify/dispatch";
import { runAdapter, runDailyJob } from "@/scrapers/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * External scheduler entry point (use when ENABLE_CRON=false, e.g. serverless):
 *   GET /api/cron/minute   – every minute
 *   GET /api/cron/daily    – once a day
 *   GET /api/cron/<adapter>
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { job } = await params;
  if (job === "minute") return NextResponse.json({ sent: await runDropAlerts(await getDb()) });
  if (job === "daily") return NextResponse.json(await runDailyJob());
  return NextResponse.json(await runAdapter(job));
}

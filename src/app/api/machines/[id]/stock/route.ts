import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { machines, stockReports } from "@/db/schema";
import { addReputation, logActivity, REP } from "@/lib/activity";
import { localClock } from "@/lib/drops/schedule";
import { submitObservation, upsertScrapedCandidate } from "@/lib/drops/engine";

const Body = z.object({
  status: z.enum(["stocked", "low", "empty", "broken", "removed"]),
  note: z.string().max(200).optional(),
});

const LABEL: Record<string, string> = {
  stocked: "📦 Stocked",
  low: "📉 Running low",
  empty: "🫙 Empty",
  broken: "🛠️ Out of order",
  removed: "❌ Machine removed",
};

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  const rateKey = `stock:${u.id}`;
  rateLimit(rateKey, 30, 3_600_000);

  const b = Body.parse(await json(req));
  const db = await getDb();
  const [m] = await db.select().from(machines).where(eq(machines.id, id));
  if (!m) throw new Error("Machine not found");

  // Check most recent stock report for Empty -> Stocked window narrowing
  const [prevReport] = await db
    .select()
    .from(stockReports)
    .where(eq(stockReports.machineId, id))
    .orderBy(desc(stockReports.createdAt))
    .limit(1);

  const now = new Date();
  await db.insert(stockReports).values({
    machineId: id,
    userId: u?.id ?? null,
    status: b.status,
    note: b.note ?? null,
  });

  const patch: Partial<typeof machines.$inferInsert> = { stockUpdatedAt: now };
  if (["stocked", "low", "empty"].includes(b.status)) patch.stockStatus = b.status;
  if (b.status === "broken") patch.status = "broken";
  if (b.status === "stocked" && m.status === "broken") patch.status = "active";
  await db.update(machines).set(patch).where(eq(machines.id, id));

  let narrowedWindowNote: string | null = null;

  // Passive "Empty -> Stocked" Window Narrowing Engine
  if (b.status === "stocked") {
    const deltaMs = prevReport ? now.getTime() - prevReport.createdAt.getTime() : Infinity;
    if (prevReport && prevReport.status === "empty" && deltaMs > 0 && deltaMs <= 35 * 60_000) {
      // Drop occurred inside [prevReport.createdAt, now]. Bias toward 90s before Stocked tap.
      const estimatedDropMs = Math.max(
        prevReport.createdAt.getTime() + 30_000,
        now.getTime() - Math.min(90_000, Math.round(deltaMs * 0.25)),
      );
      const estDate = new Date(estimatedDropMs);
      const anchor = localClock(estimatedDropMs, m.timezone).minuteOfDay % 60;
      const windowMin = Math.max(1, Math.round(deltaMs / 60_000));

      await upsertScrapedCandidate(db, {
        machineId: id,
        intervalMinutes: m.intervalMinutes ?? 60,
        anchorMinute: anchor,
        sourceUrl: `/machines/${id}#stock-window`,
        sourceTitle: `Empty → Stocked ${windowMin}m window narrowing (@ :${String(anchor).padStart(2, "0")})`,
        reliability: Math.min(0.88, Math.max(0.68, 0.9 - windowMin * 0.008)),
        mentionedAt: estDate,
      });

      await submitObservation(db, {
        machineId: id,
        userId: u?.id ?? null,
        observedAt: estDate,
        kind: "dropped",
        note: `Narrowed from Empty → Stocked transition (${windowMin}m window)`,
        source: u ? "user" : "scraped",
      });

      narrowedWindowNote = `Narrowed drop to :${String(anchor).padStart(2, "0")} from ${windowMin}m Empty→Stocked window!`;
    } else if (m.intervalMinutes == null) {
      // Unknown schedule + Stocked tap -> seed initial observation 1 min ago
      const estDate = new Date(now.getTime() - 60_000);
      await submitObservation(db, {
        machineId: id,
        userId: u?.id ?? null,
        observedAt: estDate,
        kind: "dropped",
        note: "Inferred from Stocked check-in",
        source: u ? "user" : "scraped",
      });
      const anchor = localClock(estDate.getTime(), m.timezone).minuteOfDay % 60;
      narrowedWindowNote = `Logged Stocked check-in — testing :${String(anchor).padStart(2, "0")} drop anchor!`;
    }
  }

  if (u) {
    await addReputation(db, u.id, REP.stockReport, "stock report");
  }
  await logActivity(db, {
    type: "stock",
    machineId: id,
    userId: u?.id ?? null,
    message: `${LABEL[b.status]} – ${m.retailer} ${m.city}${narrowedWindowNote ? ` (${narrowedWindowNote})` : ""}`,
    url: `/machines/${id}`,
  });

  return { ok: true, narrowedWindowNote };
});

import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { proposeCandidate } from "@/lib/drops/engine";

const Body = z.object({
  intervalMinutes: z.number().int().refine((n) => [15, 20, 30, 45, 60, 90, 120, 180, 240, 1440].includes(n), "Unsupported interval"),
  anchorMinute: z.number().int().min(0).max(1439),
  activeStartMinute: z.number().int().min(0).max(1439).nullable().optional(),
  activeEndMinute: z.number().int().min(0).max(1439).nullable().optional(),
});

/** Suggest a drop time for a machine. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  rateLimit(`propose:${u.id}`, 10, 3_600_000);
  const b = Body.parse(await json(req));
  const db = await getDb();
  const active = await proposeCandidate(db, { machineId: id, userId: u.id, ...b });
  return { ok: true, activeCandidateId: active?.id ?? null };
});

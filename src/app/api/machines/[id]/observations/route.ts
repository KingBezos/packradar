import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { submitObservation } from "@/lib/drops/engine";

const Body = z.object({
  kind: z.enum(["dropped", "no_drop"]).default("dropped"),
  /** ISO time; defaults to now. Must be within the last 24h. */
  observedAt: z.string().datetime().optional(),
  note: z.string().max(280).optional(),
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  const actorKey = u.id;
  rateLimit(`obs:${actorKey}`, 25, 3_600_000);
  rateLimit(`obs:${actorKey}:${id}`, 5, 600_000);
  const b = Body.parse(await json(req));
  const observedAt = b.observedAt ? new Date(b.observedAt) : new Date();
  const age = Date.now() - observedAt.getTime();
  if (age < -120_000 || age > 86_400_000) throw new Error("Observation time must be within the last 24 hours");
  const db = await getDb();
  const active = await submitObservation(db, {
    machineId: id,
    userId: u.id,
    observedAt,
    kind: b.kind,
    note: b.note ?? null,
  });
  return {
    ok: true,
    activeCandidateId: active?.id ?? null,
    accuracy: active?.accuracy ?? null,
    safeguardMessage: (active as { safeguardMessage?: string } | null)?.safeguardMessage ?? null,
    repHeld: Boolean((active as { repHeld?: boolean } | null)?.repHeld),
  };
});

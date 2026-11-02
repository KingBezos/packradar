import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { voteCandidate } from "@/lib/drops/engine";

const Body = z.object({ value: z.union([z.literal(1), z.literal(-1)]) });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const u = await requireUser();
  rateLimit(`vote:${u.id}`, 60, 3_600_000);
  const b = Body.parse(await json(req));
  const db = await getDb();
  const active = await voteCandidate(db, { candidateId: id, userId: u.id, value: b.value });
  return { ok: true, activeCandidateId: active?.id ?? null };
});

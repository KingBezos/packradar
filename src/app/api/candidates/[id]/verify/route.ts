import { z } from "zod";
import { route, json } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { setCandidateVerified } from "@/lib/drops/engine";

const Body = z.object({ verified: z.boolean() });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  await requireRole(["admin", "mod"]);
  const b = Body.parse(await json(req));
  const db = await getDb();
  await setCandidateVerified(db, id, b.verified);
  return { ok: true };
});

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sponsors } from "@/db/schema";

/** Sponsor click tracking + redirect. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const db = await getDb();
  if (!id) return NextResponse.redirect(new URL("/", req.url));
  const [s] = await db
    .update(sponsors)
    .set({ clicks: sql`${sponsors.clicks} + 1` })
    .where(eq(sponsors.id, id))
    .returning();
  const target = s?.url ?? "/";
  return NextResponse.redirect(target.startsWith("http") ? target : new URL(target, req.url));
}

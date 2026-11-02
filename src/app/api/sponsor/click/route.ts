import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { sponsors } from "@/db/schema";

/**
 * Sponsor click tracking + redirect.
 * Uses a relative Location header for internal paths (like `/advertise`) so reverse proxies
 * (Render, Railway, Cloudflare) never redirect the user to internal `http://localhost:3000`.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const db = await getDb();
  if (!id) {
    return new NextResponse(null, { status: 302, headers: { Location: "/advertise" } });
  }
  const [s] = await db
    .update(sponsors)
    .set({ clicks: sql`${sponsors.clicks} + 1` })
    .where(eq(sponsors.id, id))
    .returning();
  let target = s?.url || "/advertise";
  if (target === "https://example.com" || target.includes("localhost")) {
    target = "/advertise";
  }
  return new NextResponse(null, {
    status: 302,
    headers: { Location: target },
  });
}

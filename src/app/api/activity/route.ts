import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { latestActivity } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const url = new URL(req.url);
  const since = Number(url.searchParams.get("since")) || undefined;
  const items = await latestActivity(Number(url.searchParams.get("limit")) || 20, since);
  return NextResponse.json(items, { headers: { "Cache-Control": "no-store" } });
});

import { NextResponse } from "next/server";
import { z } from "zod";
import { route, json, rateLimit } from "@/lib/api";
import { getMapMachines } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { machines } from "@/db/schema";
import { slugify, timezoneFor } from "@/lib/geo";
import { addReputation, logActivity, REP } from "@/lib/activity";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const data = await getMapMachines();
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=20, stale-while-revalidate=60" } });
});

const NewMachine = z.object({
  retailer: z.string().min(2).max(60),
  street: z.string().min(3).max(120),
  city: z.string().min(2).max(60),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}$/),
  lat: z.number().min(17).max(72),
  lng: z.number().min(-180).max(-60),
  code: z
    .string()
    .regex(/^Q\d{5}$/i)
    .optional(),
});

/** Community-submitted machine (starts as "unverified"). */
export const POST = route(async (req) => {
  const u = await requireUser();
  rateLimit(`newmachine:${u.id}`, 5, 3_600_000);
  const b = NewMachine.parse(await json(req));
  const db = await getDb();
  const id = b.code ? b.code.toUpperCase() : `C-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const state = b.state.toUpperCase();
  await db
    .insert(machines)
    .values({
      id,
      code: b.code?.toUpperCase() ?? null,
      retailer: b.retailer,
      street: b.street,
      city: b.city,
      state,
      zip: b.zip,
      lat: b.lat,
      lng: b.lng,
      timezone: timezoneFor(state, b.lat, b.lng),
      citySlug: slugify(b.city),
      status: "unverified",
      source: "community",
      addedByUserId: u.id,
    })
    .onConflictDoNothing();
  await addReputation(db, u.id, REP.newMachine, "added machine");
  await logActivity(db, {
    type: "new_machine",
    machineId: id,
    userId: u.id,
    message: `📍 ${u.name} added a machine: ${b.retailer} – ${b.city}, ${state}`,
    url: `/machines/${id}`,
  });
  return { id };
});

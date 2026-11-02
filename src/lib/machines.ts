import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { machines } from "@/db/schema";
import { slugify, timezoneFor } from "@/lib/geo";
import { logActivity } from "@/lib/activity";

/** Raw record shape returned by the official locator API. */
export type OfficialMachine = {
  id: string; // airtable-like record id
  name: string; // machine code, e.g. Q01168
  lat: number;
  lng: number;
  retailer: string;
  street: string;
  city: string;
  zipPostalCode: string;
  stateProvince: string;
  country: string;
};

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .trim();
}

/** Insert or refresh an official machine. Returns "created" | "updated". */
export async function upsertOfficialMachine(
  db: DB,
  raw: OfficialMachine,
  opts: { logNew?: boolean } = {},
): Promise<"created" | "updated" | "skipped"> {
  if (raw.country && raw.country !== "US") return "skipped";
  const code = (raw.name || "").trim().toUpperCase();
  if (!/^Q\d{5}$/.test(code)) return "skipped";
  const city = titleCase(raw.city || "");
  const state = (raw.stateProvince || "").toUpperCase();
  const values = {
    officialId: raw.id,
    code,
    retailer: raw.retailer?.trim() || "Unknown",
    street: raw.street?.trim() || "",
    city,
    state,
    zip: (raw.zipPostalCode || "").slice(0, 5),
    lat: raw.lat,
    lng: raw.lng,
    timezone: timezoneFor(state, raw.lat, raw.lng),
    citySlug: slugify(city),
    lastSeenOfficialAt: new Date(),
  };
  const [existing] = await db.select({ id: machines.id, status: machines.status }).from(machines).where(eq(machines.id, code));
  if (existing) {
    await db
      .update(machines)
      .set({ ...values, status: existing.status === "removed" ? "active" : existing.status })
      .where(eq(machines.id, code));
    return "updated";
  }
  await db.insert(machines).values({ id: code, ...values, status: "active", source: "official" });
  if (opts.logNew) {
    await logActivity(db, {
      type: "new_machine",
      machineId: code,
      message: `📍 New machine found: ${values.retailer} – ${values.street}, ${city}, ${state}`,
      url: `/machines/${code}`,
    });
  }
  return "created";
}

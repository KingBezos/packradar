import { eq } from "drizzle-orm";
import { z } from "zod";
import { route, json } from "@/lib/api";
import { persistIdentityCookie, requireUser } from "@/lib/session";
import { getDb } from "@/db";
import { machines, user } from "@/db/schema";
import {
  getMachineVendedProducts,
  reportMachineProduct,
  voteMachineProduct,
} from "@/lib/vending-storage";

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const db = await getDb();
  const [m] = await db.select().from(machines).where(eq(machines.id, id.toUpperCase()));
  if (!m) throw new Error("Machine not found");
  return await getMachineVendedProducts(db, m);
});

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    sku: z.string().optional(),
    customName: z.string().max(140).optional(),
    productType: z
      .enum(["pack", "bundle", "etb", "booster_box", "knockout", "tin", "blister_collection"])
      .optional(),
    status: z.enum(["in_stock", "carries", "sold_out"]).default("in_stock"),
  }),
  z.object({
    action: z.literal("vote"),
    sku: z.string(),
    value: z.union([z.literal(1), z.literal(-1)]),
    statusOverride: z.enum(["in_stock", "carries", "sold_out"]).optional(),
  }),
]);

export const POST = route(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const u = await requireUser();
  const b = ActionSchema.parse(await json(req));
  const db = await getDb();
  const [m] = await db.select().from(machines).where(eq(machines.id, id.toUpperCase()));
  if (!m) throw new Error("Machine not found");

  if (b.action === "add") {
    if (!b.sku && (!b.customName || b.customName.trim().length < 2)) {
      throw new Error("Please select or type a product name");
    }
    const updated = await reportMachineProduct(db, m, {
      sku: b.sku,
      customName: b.customName,
      productType: b.productType,
      status: b.status,
      source: "community",
      reporterName: u?.name || "Spotter",
    });
    if (u) {
      const nextRep = (u.reputation ?? 0) + 2;
      await db
        .update(user)
        .set({ reputation: nextRep })
        .where(eq(user.id, u.id))
        .catch(() => {});
      await persistIdentityCookie({ ...u, reputation: nextRep });
    }
    return {
      ok: true,
      ...updated,
      message: u
        ? "Product added to machine assortment (+2 Rep)!"
        : "Product added to machine assortment!",
    };
  }

  const updated = await voteMachineProduct(db, m, b.sku, b.value, b.statusOverride);
  return {
    ok: true,
    ...updated,
    message: b.value === 1 ? "Confirmed product in this machine!" : "Reported sold out / not in this machine.",
  };
});

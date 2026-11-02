import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { settings } from "@/db/schema";
import {
  deriveBaselineMachineAssortment,
  VENDED_PRODUCT_CATALOG,
  type MachineProductEntry,
  type VendedProductType,
} from "./vending-catalog";

const MACHINE_PRODUCTS_KEY = "machineVendedProducts";

type StoredMachineProductsMap = Record<
  string,
  {
    kioskProfile?: "full_assortment" | "packs_and_bundles";
    profileLabel?: string;
    items: MachineProductEntry[];
    updatedAt: string;
  }
>;

async function loadMap(db: DB): Promise<StoredMachineProductsMap> {
  const [row] = await db.select().from(settings).where(eq(settings.key, MACHINE_PRODUCTS_KEY));
  return (row?.value as StoredMachineProductsMap) ?? {};
}

async function saveMap(db: DB, map: StoredMachineProductsMap) {
  await db
    .insert(settings)
    .values({ key: MACHINE_PRODUCTS_KEY, value: map, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: map, updatedAt: new Date() },
    });
}

export async function getMachineVendedProducts(
  db: DB,
  machine: { id: string; retailer: string; city: string; state: string },
) {
  const code = machine.id.toUpperCase();
  const map = await loadMap(db);
  const baseline = deriveBaselineMachineAssortment(machine);
  const stored = map[code];
  if (!stored || !Array.isArray(stored.items) || stored.items.length === 0) {
    return baseline;
  }
  return {
    kioskProfile: stored.kioskProfile ?? baseline.kioskProfile,
    profileLabel: stored.profileLabel ?? baseline.profileLabel,
    items: stored.items,
  };
}

export async function reportMachineProduct(
  db: DB,
  machine: { id: string; retailer: string; city: string; state: string },
  input: {
    sku?: string;
    customName?: string;
    productType?: VendedProductType;
    status?: "in_stock" | "carries" | "sold_out";
    source?: "scraped" | "community" | "corridor";
    reporterName?: string;
  },
) {
  const code = machine.id.toUpperCase();
  const map = await loadMap(db);
  const current = await getMachineVendedProducts(db, machine);
  const items = [...current.items];

  const cleanCustom = (input.customName || "").trim();
  const matchedCatalog =
    (input.sku ? VENDED_PRODUCT_CATALOG.find((c) => c.sku === input.sku) : undefined) ??
    (cleanCustom
      ? VENDED_PRODUCT_CATALOG.find(
          (c) =>
            c.name.toLowerCase() === cleanCustom.toLowerCase() ||
            c.sku.toLowerCase() === cleanCustom.toLowerCase(),
        )
      : undefined);

  const sku =
    matchedCatalog?.sku ??
    `custom-${cleanCustom
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 32)}`;

  const existingIdx = items.findIndex((i) => i.sku === sku || i.name.toLowerCase() === cleanCustom.toLowerCase());
  const nowIso = new Date().toISOString();

  if (existingIdx >= 0) {
    const prev = items[existingIdx];
    const nextConfirms = prev.confirms + 1;
    const nextConfidence = Math.min(100, Math.max(prev.confidence, 82) + 4);
    items[existingIdx] = {
      ...prev,
      status: input.status ?? "in_stock",
      confirms: nextConfirms,
      confidence: nextConfidence,
      lastSpottedAt: nowIso,
      lastSpottedBy: input.reporterName || prev.lastSpottedBy,
    };
  } else {
    const pType: VendedProductType =
      matchedCatalog?.productType ??
      input.productType ??
      (/etb|elite trainer/i.test(cleanCustom)
        ? "etb"
        : /booster box|36/i.test(cleanCustom)
          ? "booster_box"
          : /bundle/i.test(cleanCustom)
            ? "bundle"
            : /knock\s*out/i.test(cleanCustom)
              ? "knockout"
              : /tin/i.test(cleanCustom)
                ? "tin"
                : "pack");

    const newItem: MachineProductEntry = {
      sku,
      name: matchedCatalog?.name ?? cleanCustom,
      setName: matchedCatalog?.setName ?? "Community Spotted",
      productType: pType,
      typeLabel:
        matchedCatalog?.typeLabel ??
        (pType === "etb"
          ? "Elite Trainer Box"
          : pType === "booster_box"
            ? "Booster Box (36ct)"
            : pType === "bundle"
              ? "Booster Bundle"
              : pType === "knockout"
                ? "Knock Out Box"
                : pType === "tin"
                  ? "Collector Tin"
                  : "Booster Pack"),
      msrp:
        matchedCatalog?.msrp ??
        (pType === "etb"
          ? 49.99
          : pType === "booster_box"
            ? 161.64
            : pType === "bundle"
              ? 26.94
              : pType === "knockout"
                ? 9.99
                : pType === "tin"
                  ? 14.99
                  : 4.49),
      imageUrl: matchedCatalog?.imageUrl ?? "https://images.pokemontcg.io/sv8pt5/161_hires.png",
      status: input.status ?? "in_stock",
      confidence: input.source === "scraped" ? 88 : 85,
      confirms: 2,
      disputes: 0,
      source: input.source ?? "community",
      lastSpottedAt: nowIso,
      lastSpottedBy: input.reporterName,
    };
    items.unshift(newItem);
  }

  // Upgrade kiosk profile label if an ETB or Booster Box was confirmed in this machine
  const hasBigBox = items.some(
    (i) => (i.productType === "etb" || i.productType === "booster_box") && i.confidence >= 45,
  );

  map[code] = {
    kioskProfile: hasBigBox ? "full_assortment" : current.kioskProfile,
    profileLabel: hasBigBox
      ? "Full-Hopper Kiosk (Dispenses ETBs, Booster Boxes, Booster Bundles, Single Packs & Tins)"
      : current.profileLabel,
    items,
    updatedAt: nowIso,
  };
  await saveMap(db, map);
  return map[code];
}

export async function voteMachineProduct(
  db: DB,
  machine: { id: string; retailer: string; city: string; state: string },
  sku: string,
  vote: 1 | -1,
  statusOverride?: "in_stock" | "carries" | "sold_out",
) {
  const code = machine.id.toUpperCase();
  const map = await loadMap(db);
  const current = await getMachineVendedProducts(db, machine);
  const nowIso = new Date().toISOString();

  const items = current.items.map((item) => {
    if (item.sku !== sku) return item;
    if (vote === 1) {
      const nextConf = Math.min(100, item.confidence + 5);
      return {
        ...item,
        confirms: item.confirms + 1,
        confidence: nextConf,
        status: statusOverride ?? "in_stock",
        lastSpottedAt: nowIso,
      };
    } else {
      const nextConf = Math.max(15, item.confidence - 12);
      return {
        ...item,
        disputes: item.disputes + 1,
        confidence: nextConf,
        status: statusOverride ?? (nextConf < 50 ? "sold_out" : "carries"),
      };
    }
  });

  map[code] = {
    kioskProfile: current.kioskProfile,
    profileLabel: current.profileLabel,
    items,
    updatedAt: nowIso,
  };
  await saveMap(db, map);
  return map[code];
}

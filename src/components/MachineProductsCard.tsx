"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Package, Plus, Check, X, Search, Sparkles } from "lucide-react";
import clsx from "clsx";
import {
  VENDED_PRODUCT_CATALOG,
  PRODUCT_TYPE_LABELS,
  type MachineProductEntry,
  type VendedProductType,
} from "@/lib/vending-catalog";
import { timeAgo } from "./ui";

export function MachineProductsCard({
  machineId,
  initialProfileLabel,
  initialItems,
  signedIn = false,
}: {
  machineId: string;
  initialProfileLabel: string;
  initialItems: MachineProductEntry[];
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [profileLabel, setProfileLabel] = useState(initialProfileLabel);
  const [items, setItems] = useState<MachineProductEntry[]>(initialItems);
  const [query, setQuery] = useState("");
  const [selectedSku, setSelectedSku] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<VendedProductType | "all">("all");
  const [reportStatus, setReportStatus] = useState<"in_stock" | "carries">("in_stock");
  const [showDropdown, setShowDropdown] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VENDED_PRODUCT_CATALOG.filter((opt) => {
      if (typeFilter !== "all" && opt.productType !== typeFilter) return false;
      if (!q) return true;
      return (
        opt.name.toLowerCase().includes(q) ||
        opt.setName.toLowerCase().includes(q) ||
        opt.typeLabel.toLowerCase().includes(q) ||
        opt.keywords.some((k) => k.includes(q))
      );
    }).slice(0, 18);
  }, [query, typeFilter]);

  const activeCategories = useMemo(() => {
    const types = new Set(items.filter((i) => i.confidence >= 40).map((i) => i.productType));
    return Array.from(types);
  }, [items]);

  const handleAddProduct = async (sku?: string, customName?: string) => {
    if (!signedIn) {
      router.push("/sign-up");
      return;
    }
    const targetName = customName ?? query.trim();
    if (!sku && !targetName) return;
    setBusy("add");
    setFeedback(null);
    try {
      const res = await fetch(`/api/machines/${machineId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          sku,
          customName: targetName,
          status: reportStatus,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to report product");
      if (j.items) setItems(j.items);
      if (j.profileLabel) setProfileLabel(j.profileLabel);
      setFeedback({ ok: true, text: j.message || "Product added to this machine!" });
      setQuery("");
      setSelectedSku("");
      setShowDropdown(false);
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const handleVote = async (sku: string, value: 1 | -1) => {
    if (!signedIn) {
      router.push("/sign-up");
      return;
    }
    setBusy(`vote:${sku}:${value}`);
    setFeedback(null);
    try {
      const res = await fetch(`/api/machines/${machineId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vote",
          sku,
          value,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Vote failed");
      if (j.items) setItems(j.items);
      if (j.profileLabel) setProfileLabel(j.profileLabel);
      setFeedback({ ok: true, text: j.message });
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-volt" />
            <h2 className="text-lg font-black text-white">
              What Products Are in This Machine?
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted">{profileLabel}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {activeCategories.map((t) => {
            const meta = PRODUCT_TYPE_LABELS[t];
            return (
              <span
                key={t}
                className={clsx(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider",
                  meta.color,
                )}
              >
                ✓ {meta.short}
              </span>
            );
          })}
        </div>
      </div>

      {/* Autocomplete Product Spotter Input Box */}
      <div className="rounded-xl border border-volt/30 bg-panel-2/80 p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Sparkles className="h-3.5 w-3.5 text-volt" /> Spotted a product in {machineId}? Add or confirm it:
          </span>
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button"
              onClick={() => setReportStatus("in_stock")}
              className={clsx(
                "rounded-lg border px-2 py-0.5 font-bold",
                reportStatus === "in_stock"
                  ? "border-green-500/50 bg-green-500/15 text-green-300"
                  : "border-line text-muted",
              )}
            >
              🟢 Dispensing / In Stock
            </button>
            <button
              type="button"
              onClick={() => setReportStatus("carries")}
              className={clsx(
                "rounded-lg border px-2 py-0.5 font-bold",
                reportStatus === "carries"
                  ? "border-volt/50 bg-volt/15 text-volt"
                  : "border-line text-muted",
              )}
            >
              📦 Machine Carries Slot
            </button>
          </div>
        </div>

        {/* Category Quick Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "All Products"],
              ["etb", "ETBs ($49.99)"],
              ["booster_box", "Booster Boxes ($161.64)"],
              ["bundle", "Booster Bundles ($26.94)"],
              ["pack", "Single Packs ($4.49)"],
              ["knockout", "Knock Out Boxes ($9.99)"],
              ["tin", "Tins & Poké Balls"],
              ["blister_collection", "Collections & Blisters"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTypeFilter(k);
                setShowDropdown(true);
              }}
              className={clsx(
                "rounded-lg border px-2 py-1 text-[10px] font-bold transition",
                typeFilter === k
                  ? "border-volt bg-volt/15 text-volt"
                  : "border-line bg-bg/60 text-muted hover:text-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Autocomplete Text Input + Dropdown */}
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                type="text"
                className="input pl-9 text-xs"
                placeholder="Type set or product (e.g. Prismatic ETB, 151 Booster Bundle, Surging Sparks Booster Box, Knock Out Box)…"
                value={query}
                onFocus={() => setShowDropdown(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedSku("");
                  setShowDropdown(true);
                }}
              />
            </div>
            <button
              type="button"
              disabled={busy !== null || (!selectedSku && query.trim().length < 2)}
              onClick={() => handleAddProduct(selectedSku || undefined, query.trim())}
              className="btn-primary shrink-0 py-2 text-xs font-bold"
            >
              <Plus className="h-4 w-4" />
              {busy === "add" ? "Adding…" : "Add to Machine"}
            </button>
          </div>

          {showDropdown && (
            <div className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-volt/40 bg-bg p-1.5 shadow-2xl">
              <div className="mb-1 flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                <span>Matching Vended Sets &amp; Products ({suggestions.length})</span>
                <button
                  type="button"
                  onClick={() => setShowDropdown(false)}
                  className="text-muted hover:text-white"
                >
                  Close ✕
                </button>
              </div>
              {suggestions.map((opt) => (
                <button
                  key={opt.sku}
                  type="button"
                  onClick={() => handleAddProduct(opt.sku, opt.name)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-panel-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={opt.imageUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-contain bg-panel-2 p-0.5"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-white">{opt.name}</p>
                      <p className="text-[10px] text-muted">
                        {opt.setName} · {opt.typeLabel} · MSRP ${opt.msrp.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-volt/15 px-2 py-0.5 text-[10px] font-bold text-volt">
                    + Report
                  </span>
                </button>
              ))}
              {query.trim().length >= 3 && (
                <button
                  type="button"
                  onClick={() => handleAddProduct(undefined, query.trim())}
                  className="mt-1 flex w-full items-center justify-between rounded-lg border border-dashed border-volt/40 px-3 py-2 text-xs font-bold text-volt hover:bg-volt/10"
                >
                  <span>Add custom product: &ldquo;{query.trim()}&rdquo;</span>
                  <span>+ Add Custom</span>
                </button>
              )}
            </div>
          )}
        </div>

        {!signedIn && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-volt/30 bg-volt/10 px-3 py-2 text-xs">
            <span className="text-slate-200">
              🔒 <b className="text-volt">Free Account Required:</b> Join free or sign in to report or confirm products in {machineId} (+1 Rep).
            </span>
            <div className="flex items-center gap-2">
              <Link href="/sign-up" className="font-bold text-volt hover:underline">
                Join Free →
              </Link>
              <Link href="/sign-in" className="text-slate-300 hover:text-white hover:underline">
                Sign In
              </Link>
            </div>
          </div>
        )}
        {feedback && (
          <p className={clsx("text-xs font-semibold", feedback.ok ? "text-green-400" : "text-red-400")}>
            {feedback.text}
          </p>
        )}
      </div>

      {/* Product Assortment List */}
      <div className="space-y-2.5">
        {items.map((item) => {
          const meta = PRODUCT_TYPE_LABELS[item.productType] ?? PRODUCT_TYPE_LABELS.pack;
          return (
            <div
              key={item.sku}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel-2/40 p-3 transition hover:border-volt/30"
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-12 w-12 shrink-0 rounded-lg bg-panel-2 object-contain p-1"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={clsx(
                        "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                        meta.color,
                      )}
                    >
                      {meta.short}
                    </span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                        item.status === "in_stock"
                          ? "bg-green-500/15 text-green-400"
                          : item.status === "carries"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-red-500/15 text-red-300",
                      )}
                    >
                      {item.status === "in_stock"
                        ? "🟢 Spotted in Machine"
                        : item.status === "carries"
                          ? "🟡 Carries Slot"
                          : "🔴 Out / Empty Slot"}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-300">
                      ${item.msrp.toFixed(2)} MSRP
                    </span>
                  </div>

                  <p className="mt-1 truncate text-sm font-bold text-white">{item.name}</p>
                  <p className="text-[11px] text-muted">
                    {item.confidence}% confidence · {item.confirms} confirms
                    {item.disputes > 0 ? ` · ${item.disputes} sold-out reports` : ""} · updated{" "}
                    {timeAgo(item.lastSpottedAt)}
                    {item.lastSpottedBy ? ` by ${item.lastSpottedBy}` : ""}
                  </p>
                </div>
              </div>

              {/* Community Confirm / Dispute Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => handleVote(item.sku, 1)}
                  title="Confirm this product is in this machine"
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-green-400 hover:text-green-300"
                >
                  <Check className="h-3.5 w-3.5 text-green-400" /> In Machine
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => handleVote(item.sku, -1)}
                  title="Report sold out or not carried in this machine"
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs font-semibold text-muted hover:border-red-400 hover:text-red-300"
                >
                  <X className="h-3.5 w-3.5 text-red-400" /> Out / No
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

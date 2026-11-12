"use client";

import Link from "next/link";
import { Lock, LockOpen, MapPin, Sparkles } from "lucide-react";
import type { Machine } from "@/db/schema";
import { machineSchedule } from "@/lib/drops/engine";
import { describeSchedule } from "@/lib/drops/schedule";
import { LiveDropStatus } from "./live";
import { AccuracyMeter } from "./AccuracyMeter";
import { QuickAlertButton } from "./QuickAlertButton";

export function MachineCard({
  m,
  distance,
  lockedTimer = false,
  unlockLabel,
  freePreviewBadge = false,
}: {
  m: Machine;
  distance?: number | null;
  lockedTimer?: boolean;
  unlockLabel?: string;
  freePreviewBadge?: boolean;
}) {
  const sched = machineSchedule(m);
  const href = lockedTimer ? `/machines/${m.id}?locked=1` : `/machines/${m.id}`;

  const handleUnlockScroll = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      const el = document.getElementById("instant-zip-capture");
      if (el) {
        e.preventDefault();
        e.stopPropagation();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        window.dispatchEvent(new CustomEvent("packradar:focus-zip-capture"));
      }
    }
  };

  const intervalText =
    m.intervalMinutes === 30
      ? "Drops every 30 min at :?? & :??"
      : "Drops hourly at :??";

  return (
    <Link
      href={href}
      className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-volt/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-bold text-white group-hover:text-volt">{m.retailer}</p>
            {freePreviewBadge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300 ring-1 ring-emerald-400/40">
                <Sparkles className="h-2.5 w-2.5" /> #1 Closest Free Preview
              </span>
            )}
          </div>
          <p className="flex items-center gap-1 truncate text-sm text-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {m.street}, {m.city}, {m.state}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className="font-mono text-[11px] text-muted">{m.id}</span>
          {distance != null && <p className="text-xs font-semibold text-slate-300">{distance.toFixed(1)} mi</p>}
        </div>
      </div>

      {lockedTimer && sched ? (
        <>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-volt/40 bg-volt/10 px-3 py-1 text-xs font-bold text-volt">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono">{intervalText}</span>
          </div>
          <AccuracyMeter accuracy={m.accuracy} verified={m.scheduleVerified} size="sm" />
          <div className="mt-auto pt-1">
            <button
              type="button"
              onClick={handleUnlockScroll}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-volt/50 bg-gradient-to-r from-yellow-500/20 to-amber-500/15 px-3 py-2 text-xs font-extrabold text-volt transition hover:border-volt hover:bg-volt hover:text-slate-950"
            >
              <LockOpen className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {unlockLabel || "Unlock exact :XX timer — Free Account"}
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          <LiveDropStatus schedule={sched} accuracy={m.accuracy} verified={m.scheduleVerified} />
          {sched ? (
            <>
              <p className="text-xs text-muted">{describeSchedule(sched)}</p>
              <AccuracyMeter accuracy={m.accuracy} verified={m.scheduleVerified} size="sm" />
            </>
          ) : (
            <p className="text-xs text-muted">No drop time yet. Be the first to report one (+10 rep “First Finder”).</p>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <QuickAlertButton machineId={m.id} anchorMinute={m.anchorMinute} compact />
            {m.status !== "active" && (
              <span className="w-fit rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-semibold text-orange-300">
                {m.status === "broken"
                  ? "Reported out of order"
                  : m.status === "unverified"
                    ? "Community-added (unverified)"
                    : m.status}
              </span>
            )}
          </div>
        </>
      )}
    </Link>
  );
}

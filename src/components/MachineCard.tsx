import Link from "next/link";
import { MapPin } from "lucide-react";
import type { Machine } from "@/db/schema";
import { machineSchedule } from "@/lib/drops/engine";
import { describeSchedule } from "@/lib/drops/schedule";
import { LiveDropStatus } from "./live";
import { AccuracyMeter } from "./AccuracyMeter";
import { QuickAlertButton } from "./QuickAlertButton";

export function MachineCard({ m, distance }: { m: Machine; distance?: number | null }) {
  const sched = machineSchedule(m);
  return (
    <Link
      href={`/machines/${m.id}`}
      className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:border-volt/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-white group-hover:text-volt">{m.retailer}</p>
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
    </Link>
  );
}

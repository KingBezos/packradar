"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  CONFIRMED_ACCURACY_THRESHOLD,
  formatCountdown,
  getDropState,
  type DropSchedule,
  type DropStatus,
} from "@/lib/drops/schedule";

/** Shared 1-second clock so many countdowns re-render together. */
let listeners = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs !== 1000) {
      const t = setInterval(() => setNow(Date.now()), intervalMs);
      return () => clearInterval(t);
    }
    listeners.add(setNow);
    if (!timer) timer = setInterval(() => listeners.forEach((l) => l(Date.now())), 1000);
    return () => {
      listeners.delete(setNow);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
        listeners = new Set();
      }
    };
  }, [intervalMs]);
  return now;
}

export const STATUS_META: Record<DropStatus, { label: string; color: string; text: string; bg: string; ring: string }> = {
  dropped: { label: "Just dropped", color: "#22c55e", text: "text-green-400", bg: "bg-green-500/15", ring: "ring-green-500/40" },
  imminent: { label: "Dropping soon", color: "#facc15", text: "text-yellow-300", bg: "bg-yellow-400/15", ring: "ring-yellow-400/40" },
  idle: { label: "No drop soon", color: "#ef4444", text: "text-red-400", bg: "bg-red-500/10", ring: "ring-red-500/30" },
  unknown: { label: "Drop time unknown", color: "#64748b", text: "text-slate-400", bg: "bg-slate-500/10", ring: "ring-slate-500/30" },
};

export function StatusDot({ status, unconfirmed, size = 12 }: { status: DropStatus; unconfirmed?: boolean; size?: number }) {
  const meta = STATUS_META[status];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {(status === "dropped" || status === "imminent") && (
        <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: meta.color }} />
      )}
      <span className="absolute inset-0 rounded-full" style={{ background: meta.color }} />
      {unconfirmed && status !== "unknown" && (
        <span className="absolute -inset-[3px] rounded-full border-2 border-dashed border-orange-300/80" />
      )}
    </span>
  );
}

/** Live status pill + countdown for a schedule. */
export function LiveDropStatus({
  schedule,
  accuracy,
  verified,
  variant = "pill",
}: {
  schedule: DropSchedule | null;
  accuracy: number | null;
  verified: boolean;
  variant?: "pill" | "big" | "inline";
}) {
  const now = useNow();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const st = getDropState(schedule, now);
  const meta = STATUS_META[st.status];
  const unconfirmed = schedule != null && !verified && (accuracy ?? 0) < CONFIRMED_ACCURACY_THRESHOLD;

  const text =
    st.status === "unknown"
      ? "Help us find the drop times"
      : st.status === "dropped"
        ? `Dropped ${formatCountdown(st.secondsSincePrev)} ago`
        : `Next drop in ${formatCountdown(st.secondsToNext)}`;

  if (variant === "big") {
    const nextLabel =
      st.nextDropMs && schedule
        ? new Date(st.nextDropMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: schedule.timezone })
        : null;
    return (
      <div className={clsx("rounded-2xl p-5 ring-1", meta.bg, meta.ring)}>
        <div className="flex items-center gap-3">
          <StatusDot status={st.status} unconfirmed={unconfirmed} size={16} />
          <span className={clsx("text-sm font-bold uppercase tracking-wider", meta.text)}>{meta.label}</span>
          {unconfirmed && (
            <span className="rounded-full border border-orange-300/50 bg-orange-400/10 px-2 py-0.5 text-[11px] font-semibold text-orange-200">
              ? Unconfirmed
            </span>
          )}
        </div>
        <div className="mt-3 font-mono text-5xl font-black tabular-nums text-white sm:text-6xl" suppressHydrationWarning>
          {!mounted
            ? "--:--"
            : st.status === "unknown"
              ? "??:??"
              : st.status === "dropped"
                ? formatCountdown(st.secondsSincePrev)
                : formatCountdown(st.secondsToNext)}
        </div>
        <div className="mt-1 text-sm text-muted" suppressHydrationWarning>
          {st.status === "unknown"
            ? "No drop time yet — report one below to help us find the drop times."
            : st.status === "dropped"
              ? `since the last drop · next at ${nextLabel ?? "—"}`
              : `until the next drop${nextLabel ? ` at ${nextLabel}` : ""} (machine local time)`}
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span className={clsx("inline-flex items-center gap-1.5 text-xs font-semibold", meta.text)} suppressHydrationWarning>
        <StatusDot status={st.status} unconfirmed={unconfirmed} size={8} />
        {mounted ? text : "…"}
      </span>
    );
  }

  return (
    <span
      className={clsx("inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", meta.bg, meta.text, meta.ring)}
      suppressHydrationWarning
    >
      <StatusDot status={st.status} unconfirmed={unconfirmed} size={9} />
      <span className="tabular-nums">{mounted ? text : "…"}</span>
    </span>
  );
}

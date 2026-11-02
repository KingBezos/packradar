"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LocateFixed } from "lucide-react";
import clsx from "clsx";
import type { MapMachine } from "@/lib/queries";
import { formatCountdown, getDropState } from "@/lib/drops/schedule";
import { haversineMiles } from "@/lib/geo";
import { scheduleOf } from "@/lib/map-machine";
import { STATUS_META, StatusDot, useNow } from "./live";

/** "Next drops" list – nationwide, or near you once location is shared. */
export function DroppingSoon({ limit = 8 }: { limit?: number }) {
  const [machines, setMachines] = useState<MapMachine[]>([]);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const now = useNow();

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then(setMachines)
      .catch(() => {});
    const saved = localStorage.getItem("pr:pos");
    if (saved) setPos(JSON.parse(saved));
  }, []);

  const locate = () =>
    navigator.geolocation?.getCurrentPosition((p) => {
      const v = { lat: p.coords.latitude, lng: p.coords.longitude };
      localStorage.setItem("pr:pos", JSON.stringify(v));
      setPos(v);
    });

  const rows = useMemo(() => {
    return machines
      .filter((m) => m.i != null)
      .filter((m) => !confirmedOnly || m.v || (m.acc ?? 0) >= 90)
      .map((m) => ({ m, st: getDropState(scheduleOf(m), now), d: pos ? haversineMiles(pos.lat, pos.lng, m.lat, m.lng) : null }))
      .filter((r) => r.d == null || r.d <= 30)
      .filter((r) => r.st.status !== "idle" || (r.st.secondsToNext ?? 1e9) < 3600)
      .sort((a, b) => {
        const ka = a.st.status === "dropped" ? -1 : (a.st.secondsToNext ?? 1e9);
        const kb = b.st.status === "dropped" ? -1 : (b.st.secondsToNext ?? 1e9);
        return ka - kb;
      })
      .slice(0, limit);
  }, [machines, now, pos, confirmedOnly, limit]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="font-bold text-white">⚡ Next drops {pos ? "near you" : "nationwide"}</p>
          <p className="text-xs text-muted">{pos ? "Within 30 miles" : "Share your location to see machines near you"}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setConfirmedOnly((c) => !c)} className={clsx("chip", confirmedOnly && "border-green-500/50 text-green-300")}>
            ✔ Confirmed only
          </button>
          {!pos && (
            <button onClick={locate} className="chip hover:text-white">
              <LocateFixed className="h-3 w-3" /> Near me
            </button>
          )}
        </div>
      </div>
      <ul className="divide-y divide-line">
        {rows.length === 0 && <li className="p-4 text-sm text-muted">Nothing dropping in the next hour{pos ? " near you" : ""}.</li>}
        {rows.map(({ m, st, d }) => {
          const unconf = !m.v && (m.acc ?? 0) < 90;
          return (
            <li key={m.id}>
              <Link href={`/machines/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-2">
                <StatusDot status={st.status} unconfirmed={unconf} size={10} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {m.retailer} <span className="font-normal text-muted">· {m.city}, {m.state}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {m.street}
                    {d != null && ` · ${d.toFixed(1)} mi`}
                  </p>
                </div>
                <div className="text-right">
                  <p className={clsx("font-mono text-sm font-black tabular-nums", STATUS_META[st.status].text)} suppressHydrationWarning>
                    {st.status === "dropped" ? "DROPPED" : formatCountdown(st.secondsToNext)}
                  </p>
                  <p className={clsx("text-[10px] font-semibold", unconf ? "text-orange-300" : "text-green-400")}>
                    {unconf ? "? " : "✔ "}
                    {m.v ? 100 : Math.round(m.acc ?? 0)}%
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import { Crosshair, Layers } from "lucide-react";
import { getMaplibre } from "@/lib/maplibre";
import {
  describeSchedule,
  formatCountdown,
  getDropState,
  type DropStatus,
} from "@/lib/drops/schedule";
import type { MapMachine } from "@/lib/queries";
import { isUnconfirmed, scheduleOf } from "@/lib/map-machine";
import { STATUS_META, StatusDot, useNow } from "./live";

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/dark";
const US_CENTER: [number, number] = [-98.5, 39.5];

type Filter = "all" | "soon" | "dropped" | "confirmed" | "known";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "soon", label: "🟡 Dropping ≤10m" },
  { key: "dropped", label: "🟢 Just dropped" },
  { key: "confirmed", label: "✔ Confirmed times" },
  { key: "known", label: "Has drop time" },
];

function passes(f: Filter, m: MapMachine, status: DropStatus) {
  switch (f) {
    case "soon":
      return status === "imminent";
    case "dropped":
      return status === "dropped";
    case "confirmed":
      return m.i != null && !isUnconfirmed(m);
    case "known":
      return m.i != null;
    default:
      return true;
  }
}

function popupHtml(m: MapMachine, now: number) {
  const st = getDropState(scheduleOf(m), now);
  const meta = STATUS_META[st.status];
  const sched = scheduleOf(m);
  const unconf = isUnconfirmed(m);
  const acc = m.v ? 100 : m.acc != null ? Math.round(m.acc) : null;
  const line =
    st.status === "unknown"
      ? "Drop time unknown – help us find the drop times!"
      : st.status === "dropped"
        ? `Dropped ${formatCountdown(st.secondsSincePrev)} ago`
        : `Next drop in <b style="font-family:ui-monospace,monospace">${formatCountdown(st.secondsToNext)}</b>`;
  return `
    <div style="min-width:220px;max-width:260px">
      <div style="font-size:11px;color:#8b97b0;font-weight:600;letter-spacing:.04em">${m.id}</div>
      <div style="font-weight:800;font-size:15px;color:#fff;margin-top:2px">${escape(m.retailer)}</div>
      <div style="font-size:12px;color:#8b97b0">${escape(m.street)}, ${escape(m.city)}, ${m.state}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
        <span style="width:10px;height:10px;border-radius:9999px;background:${meta.color};display:inline-block;${unconf ? "outline:2px dashed #fdba74;outline-offset:2px;" : ""}"></span>
        <span style="font-size:13px;color:#fff">${line}</span>
      </div>
      ${sched ? `<div style="font-size:11px;color:#8b97b0;margin-top:6px">${escape(describeSchedule(sched))}</div>` : ""}
      ${
        acc != null
          ? `<div style="margin-top:8px;font-size:11px;color:${unconf ? "#fdba74" : "#4ade80"};font-weight:700">${unconf ? "? Unconfirmed" : m.v ? "✔ Verified" : "✔ Confirmed"} · ${acc}% accuracy</div>
             <div style="height:5px;background:#1e293b;border-radius:9999px;margin-top:4px;overflow:hidden"><div style="height:100%;width:${acc}%;background:${unconf ? "#fb923c" : "#22c55e"}"></div></div>`
          : ""
      }
      <div style="display:flex;gap:6px;margin-top:10px">
        <a href="/machines/${m.id}" style="flex:1;text-align:center;background:#facc15;color:#0f172a;font-weight:800;border-radius:10px;padding:7px 8px;font-size:12px;text-decoration:none">Open machine →</a>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${m.retailer}, ${m.street}, ${m.city}, ${m.state}`)}" target="_blank" rel="noopener noreferrer" style="text-align:center;background:#1e293b;color:#f8fafc;font-weight:700;border-radius:10px;padding:7px 9px;font-size:12px;text-decoration:none;border:1px solid #334155">🧭 Map</a>
      </div>
    </div>`;
}

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export type DropMapProps = {
  machines?: MapMachine[];
  center?: [number, number] | null; // [lng, lat]
  zoom?: number;
  height?: string;
  showList?: boolean;
  showFilters?: boolean;
  focusId?: string;
  className?: string;
};

export function DropMap({
  machines: initial,
  center,
  zoom,
  height = "70vh",
  showList = false,
  showFilters = true,
  focusId,
  className,
}: DropMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const popupRef = useRef<{ popup: maplibregl.Popup; id: string } | null>(null);
  const [machines, setMachines] = useState<MapMachine[]>(initial ?? []);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [bounds, setBounds] = useState<maplibregl.LngLatBounds | null>(null);
  // Legend starts collapsed on phones so it doesn't cover the map.
  const [showLegend, setShowLegend] = useState(() => typeof window === "undefined" || window.innerWidth >= 768);
  const now = useNow();
  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  // Load machine data (and refresh every 60s so new drop times appear).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/machines");
        if (r.ok && alive) setMachines(await r.json());
      } catch {}
    };
    if (!initial) load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [initial]);

  // Init map once.
  useEffect(() => {
    if (!container.current || mapRef.current) return;
    getMaplibre();
    const focus = focusId && initial?.find((m) => m.id === focusId);
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: focus ? [focus.lng, focus.lat] : (center ?? US_CENTER),
      zoom: zoom ?? (focus ? 13 : center ? 10 : 3.4),
      attributionControl: { compact: true },
      cooperativeGestures: !showList,
    });
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container.current);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __prMap?: MLMap }).__prMap = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-right");

    map.on("load", () => {
      map.addSource("machines", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 42,
        clusterProperties: {
          dropped: ["+", ["case", ["==", ["get", "status"], "dropped"], 1, 0]],
          imminent: ["+", ["case", ["==", ["get", "status"], "imminent"], 1, 0]],
        },
      });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "machines",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["case", [">", ["get", "dropped"], 0], "#22c55e", [">", ["get", "imminent"], 0], "#facc15", "#ef4444"],
          "circle-opacity": 0.85,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24, 200, 30],
          "circle-stroke-width": 3,
          "circle-stroke-color": "rgba(7,11,22,0.8)",
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "machines",
        filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12 },
        paint: { "text-color": "#0b1020" },
      });
      map.addLayer({
        id: "halo",
        type: "circle",
        source: "machines",
        filter: ["all", ["!", ["has", "point_count"]], ["in", ["get", "status"], ["literal", ["dropped", "imminent"]]]],
        paint: {
          "circle-color": ["match", ["get", "status"], "dropped", "#22c55e", "#facc15"],
          "circle-radius": 16,
          "circle-opacity": 0.25,
          "circle-blur": 0.4,
        },
      });
      map.addLayer({
        id: "points",
        type: "circle",
        source: "machines",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["match", ["get", "status"], "dropped", "#22c55e", "imminent", "#facc15", "idle", "#ef4444", "#64748b"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 10, 7, 15, 10],
          "circle-stroke-width": ["case", ["get", "unconfirmed"], 3, 1.5],
          "circle-stroke-color": ["case", ["get", "unconfirmed"], "#fdba74", "#0b1020"],
        },
      });
      map.addLayer({
        id: "unconfirmed-q",
        type: "symbol",
        source: "machines",
        minzoom: 10,
        filter: ["all", ["!", ["has", "point_count"]], ["get", "unconfirmed"]],
        layout: {
          "text-field": "?",
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-offset": [0.9, -0.9],
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#fdba74", "text-halo-color": "#0b1020", "text-halo-width": 1.5 },
      });

      map.on("click", "clusters", async (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        if (!f) return;
        const src = map.getSource("machines") as GeoJSONSource;
        const z = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.5 });
      });
      map.on("click", "points", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.id as string;
        openPopup(id, (f.geometry as GeoJSON.Point).coordinates as [number, number]);
      });
      for (const l of ["clusters", "points"]) {
        map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
      }
      map.on("moveend", () => setBounds(map.getBounds()));
      setBounds(map.getBounds());
      // Start with the attribution collapsed (it opens by default and covers small maps).
      map.getContainer().querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      setLoaded(true);
    });

    // Gentle halo pulse.
    let raf = 0;
    const animate = (t: number) => {
      if (map.getLayer("halo")) {
        const p = (Math.sin(t / 350) + 1) / 2;
        map.setPaintProperty("halo", "circle-radius", 12 + p * 10);
        map.setPaintProperty("halo", "circle-opacity", 0.35 - p * 0.25);
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(raf);
      map.remove();
      ro.disconnect();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPopup = (id: string, coords: [number, number]) => {
    const map = mapRef.current;
    const m = byIdRef.current.get(id);
    if (!map || !m) return;
    popupRef.current?.popup.remove();
    const popup = new maplibregl.Popup({ offset: 14, maxWidth: "280px", focusAfterOpen: false }).setLngLat(coords).setHTML(popupHtml(m, Date.now())).addTo(map);
    popupRef.current = { popup, id };
    popup.on("close", () => {
      if (popupRef.current?.popup === popup) popupRef.current = null;
    });
  };
  const byIdRef = useRef(byId);
  useEffect(() => {
    byIdRef.current = byId;
  }, [byId]);

  // Compute statuses each second; only push to the map when something changed.
  const statuses = useMemo(() => {
    const out = new Map<string, DropStatus>();
    for (const m of machines) out.set(m.id, getDropState(scheduleOf(m), now).status);
    return out;
  }, [machines, now]);
  const signature = useMemo(() => {
    let s = filter;
    for (const [id, st] of statuses) s += id + st[0];
    return s;
  }, [statuses, filter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const src = map.getSource("machines") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: machines
        .filter((m) => passes(filter, m, statuses.get(m.id) ?? "unknown"))
        .map((m) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [m.lng, m.lat] },
          properties: { id: m.id, status: statuses.get(m.id) ?? "unknown", unconfirmed: isUnconfirmed(m) },
        })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loaded]);

  // Keep an open popup's countdown live.
  useEffect(() => {
    const p = popupRef.current;
    if (!p) return;
    const m = byId.get(p.id);
    if (m) p.popup.setHTML(popupHtml(m, now));
  }, [now, byId]);

  // Focus a machine (detail page) once data + map are ready.
  useEffect(() => {
    if (!loaded || !focusId) return;
    const m = byId.get(focusId);
    if (m) openPopup(m.id, [m.lng, m.lat]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, focusId]);

  const counts = useMemo(() => {
    let dropped = 0;
    let imminent = 0;
    for (const s of statuses.values()) {
      if (s === "dropped") dropped++;
      else if (s === "imminent") imminent++;
    }
    return { dropped, imminent };
  }, [statuses]);

  const visible = useMemo(() => {
    if (!showList || !bounds) return [];
    const order: Record<DropStatus, number> = { dropped: 0, imminent: 1, idle: 2, unknown: 3 };
    return machines
      .filter((m) => bounds.contains([m.lng, m.lat]))
      .map((m) => ({ m, st: getDropState(scheduleOf(m), now) }))
      .filter(({ m, st }) => passes(filter, m, st.status))
      .sort((a, b) => order[a.st.status] - order[b.st.status] || (a.st.secondsToNext ?? 1e9) - (b.st.secondsToNext ?? 1e9))
      .slice(0, 40);
  }, [machines, bounds, now, filter, showList]);

  return (
    <div className={clsx("flex flex-col gap-3 lg:flex-row", className)}>
      <div
        className="relative h-[min(var(--map-h),62svh)] w-full shrink-0 overflow-hidden rounded-2xl border border-line lg:h-[var(--map-h)] lg:flex-1"
        style={{ ["--map-h" as string]: height }}
      >
        <div ref={container} className="absolute inset-0" style={{ position: "absolute", inset: 0 }} />
        {showFilters && (
          <div className="absolute left-3 top-3 flex max-w-[calc(100%-5rem)] flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-md transition",
                  filter === f.key ? "border-volt bg-volt text-slate-950" : "border-line bg-bg/80 text-slate-200 hover:border-slate-500",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <span className="rounded-full border border-green-500/40 bg-bg/85 px-3 py-1 text-xs font-bold text-green-400 backdrop-blur-md">
              🟢 {counts.dropped} just dropped
            </span>
            <span className="rounded-full border border-yellow-400/40 bg-bg/85 px-3 py-1 text-xs font-bold text-yellow-300 backdrop-blur-md">
              🟡 {counts.imminent} dropping soon
            </span>
          </div>
          {showLegend ? (
            <div className="rounded-xl border border-line bg-bg/85 p-3 text-xs backdrop-blur-md">
              <div className="mb-1.5 flex items-center justify-between gap-6 font-semibold text-white">
                Legend
                <button onClick={() => setShowLegend(false)} className="text-muted hover:text-white">
                  hide
                </button>
              </div>
              <ul className="space-y-1 text-slate-300">
                <li className="flex items-center gap-2"><StatusDot status="dropped" size={10} /> Dropped (last 5 min)</li>
                <li className="flex items-center gap-2"><StatusDot status="imminent" size={10} /> Drop within 10 min</li>
                <li className="flex items-center gap-2"><StatusDot status="idle" size={10} /> No drop imminent</li>
                <li className="flex items-center gap-2"><StatusDot status="unknown" size={10} /> Drop time unknown</li>
                <li className="flex items-center gap-2"><StatusDot status="idle" unconfirmed size={10} /> <span className="text-orange-200">Dashed ring / ? = unconfirmed</span></li>
              </ul>
            </div>
          ) : (
            <button onClick={() => setShowLegend(true)} className="flex w-fit items-center gap-1 rounded-full border border-line bg-bg/85 px-3 py-1 text-xs text-slate-300 backdrop-blur-md">
              <Layers className="h-3.5 w-3.5" /> Legend
            </button>
          )}
        </div>
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-panel">
            <Crosshair className="h-8 w-8 animate-spin text-volt" />
          </div>
        )}
      </div>

      {showList && (
        <aside className="card flex max-h-[70svh] w-full flex-col overflow-hidden lg:max-h-none lg:h-[var(--map-h)] lg:w-96" style={{ ["--map-h" as string]: height }}>
          <div className="border-b border-line px-4 py-3">
            <p className="font-bold text-white">Machines in view</p>
            <p className="text-xs text-muted">Sorted by what&apos;s dropping next · zoom/pan to update</p>
          </div>
          <ul className="flex-1 divide-y divide-line overflow-y-auto">
            {visible.length === 0 && <li className="p-4 text-sm text-muted">No machines here. Zoom out or change filters.</li>}
            {visible.map(({ m, st }) => {
              const unconf = isUnconfirmed(m);
              return (
                <li key={m.id}>
                  <button
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-panel-2"
                    onClick={() => {
                      mapRef.current?.flyTo({ center: [m.lng, m.lat], zoom: Math.max(mapRef.current.getZoom(), 13) });
                      openPopup(m.id, [m.lng, m.lat]);
                    }}
                  >
                    <span className="mt-1.5">
                      <StatusDot status={st.status} unconfirmed={unconf} size={10} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">
                        {m.retailer} <span className="font-normal text-muted">· {m.city}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{m.street}</span>
                    </span>
                    <span className={clsx("shrink-0 text-right font-mono text-xs font-bold tabular-nums", STATUS_META[st.status].text)}>
                      {st.status === "unknown" ? "—" : st.status === "dropped" ? `+${formatCountdown(st.secondsSincePrev)}` : formatCountdown(st.secondsToNext)}
                      {m.acc != null && <span className={clsx("block text-[10px] font-semibold", unconf ? "text-orange-300" : "text-green-400")}>{m.v ? 100 : Math.round(m.acc)}%</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line p-3 text-center text-xs text-muted">
            Know a drop time? <Link href="/about#help" className="text-volt hover:underline">Help confirm it</Link>
          </div>
        </aside>
      )}
    </div>
  );
}

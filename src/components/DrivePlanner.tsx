"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getMaplibre } from "@/lib/maplibre";
import { Crown, LocateFixed, Loader2, Navigation, Route } from "lucide-react";

type Stop = {
  order: number;
  id: string;
  label: string;
  lat: number;
  lng: number;
  dropMs: number;
  arriveMs: number;
  departMs: number;
  waitMin: number;
  legMiles: number;
  legMin: number;
  confidence: number;
};
type Result = {
  considered: number;
  mapsUrl: string | null;
  totals: { miles: number; driveMin: number; waitMin: number; endMs: number; expectedCatches: number };
  stops: Stop[];
  skipped: { id: string; label: string; reason: string }[];
};

const fmt = (ms: number) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/dark";

export function DrivePlanner({ premium, signedIn, homeZip }: { premium: boolean; signedIn: boolean; homeZip: string | null }) {
  const [where, setWhere] = useState(homeZip ?? "");
  const [start, setStart] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(25);
  const [horizon, setHorizon] = useState(180);
  const [maxStops, setMaxStops] = useState(8);
  const [minAcc, setMinAcc] = useState(0);
  const [speed, setSpeed] = useState(28);
  const [maxWait, setMaxWait] = useState(12);
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [loop, setLoop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [checkins, setCheckins] = useState<Record<string, "dropped" | "no_drop">>({});
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);

  const recordStopCheckin = async (machineId: string, kind: "dropped" | "no_drop", dropMs: number) => {
    try {
      await fetch(`/api/machines/${machineId}/observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          observedAt: new Date(dropMs).toISOString(),
          note: "Logged via Drive Plan Live Run",
        }),
      });
      setCheckins((prev) => ({ ...prev, [machineId]: kind }));
    } catch {}
  };

  const resolveStart = async () => {
    if (start && !where) return start;
    const r = await fetch(`/api/search?q=${encodeURIComponent(where)}&radius=1`);
    const j = await r.json();
    if (!j.center) throw new Error("Couldn't find that location. Try a ZIP code or use your location.");
    const s = { lat: j.center.lat, lng: j.center.lng };
    setStart(s);
    return s;
  };

  const locate = () =>
    navigator.geolocation?.getCurrentPosition((p) => {
      setStart({ lat: p.coords.latitude, lng: p.coords.longitude });
      setWhere("");
    });

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const s = await resolveStart();
      const r = await fetch("/api/drive-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: s,
          radiusMiles: radius,
          horizonMin: horizon,
          maxStops,
          minAccuracy: minAcc,
          avgSpeedMph: speed,
          maxWaitMin: maxWait,
          onlyFavorites: onlyFavs,
          returnToStart: loop,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      setRes(j);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Map rendering
  useEffect(() => {
    if (!mapEl.current || map.current) return;
    getMaplibre();
    map.current = new maplibregl.Map({ container: mapEl.current, style: STYLE, center: [-98.5, 39.5], zoom: 3.4 });
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const draw = () => {
      if (m.getLayer("route")) m.removeLayer("route");
      if (m.getSource("route")) m.removeSource("route");
      if (!res || !start) return;
      const pts: [number, number][] = [[start.lng, start.lat], ...res.stops.map((s) => [s.lng, s.lat] as [number, number])];
      if (loop) pts.push([start.lng, start.lat]);
      m.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pts } } });
      m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#facc15", "line-width": 4, "line-dasharray": [2, 1.5], "line-opacity": 0.9 } });
      const el = document.createElement("div");
      el.className = "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-blue-500 text-xs font-black text-white";
      el.textContent = "GO";
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([start.lng, start.lat]).addTo(m));
      for (const s of res.stops) {
        const d = document.createElement("div");
        d.className = "flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-yellow-400 text-sm font-black text-slate-950 shadow-lg";
        d.textContent = String(s.order);
        markers.current.push(new maplibregl.Marker({ element: d }).setLngLat([s.lng, s.lat]).addTo(m));
      }
      const b = new maplibregl.LngLatBounds();
      pts.forEach((p) => b.extend(p));
      m.fitBounds(b, { padding: 60, maxZoom: 13, duration: 600 });
    };
    if (m.isStyleLoaded()) draw();
    else m.once("load", draw);
  }, [res, start, loop]);

  if (!signedIn || !premium) {
    return (
      <div className="card mx-auto max-w-2xl border-volt/30 bg-gradient-to-br from-volt/10 to-transparent p-8 text-center">
        <Crown className="mx-auto h-10 w-10 text-volt" />
        <h2 className="mt-3 text-2xl font-black text-white">Drive Plan is a Premium feature</h2>
        <p className="mt-2 text-muted">
          Tell us where you are and how long you have. PackRadar builds the most efficient route through the machines around you so you arrive right as they drop, favoring the drop times we trust most.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          {!signedIn && <Link href="/sign-in" className="btn-ghost">Sign in</Link>}
          <Link href="/premium" className="btn-primary">See Premium</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
      <div className="card h-fit space-y-4 p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Start from</label>
          <div className="flex gap-2">
            <input className="input" placeholder="ZIP, city or address" value={where} onChange={(e) => setWhere(e.target.value)} />
            <button className="btn-ghost px-3" onClick={locate} title="Use my location"><LocateFixed className="h-4 w-4" /></button>
          </div>
          {start && !where && <p className="mt-1 text-xs text-green-400">Using your current location</p>}
        </div>
        <Slider label="Search radius" value={radius} min={5} max={75} step={5} unit="mi" onChange={setRadius} />
        <Slider label="Plan length" value={horizon} min={60} max={360} step={30} unit="min" onChange={setHorizon} />
        <Slider label="Max stops" value={maxStops} min={2} max={15} step={1} onChange={setMaxStops} />
        <Slider label="Min. drop-time accuracy" value={minAcc} min={0} max={95} step={5} unit="%" onChange={setMinAcc} />
        <Slider label="Avg. driving speed" value={speed} min={15} max={55} step={1} unit="mph" onChange={setSpeed} />
        <Slider label="Max wait per stop" value={maxWait} min={0} max={30} step={1} unit="min" onChange={setMaxWait} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFavs} onChange={(e) => setOnlyFavs(e.target.checked)} /> Only my favorite machines</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> Return to start</label>
        <button className="btn-primary w-full" disabled={busy || (!start && !where)} onClick={generate}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />} Build my drive plan
        </button>
        {err && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{err}</p>}
      </div>

      <div className="space-y-4">
        <div ref={mapEl} className="h-[380px] overflow-hidden rounded-2xl border border-line" />
        {res && (
          <div className="card p-5">
            {res.stops.length === 0 ? (
              <p className="text-sm text-muted">
                No catchable drops found among {res.considered} machines. Try a longer plan, bigger radius, or lower accuracy filter.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="chip text-white">{res.stops.length} stops</span>
                    <span className="chip text-white">{res.totals.miles.toFixed(1)} mi</span>
                    <span className="chip text-white">{Math.round(res.totals.driveMin)} min driving</span>
                    <span className="chip text-white">{Math.round(res.totals.waitMin)} min waiting</span>
                    <span className="chip border-green-500/40 text-green-300">~{res.totals.expectedCatches.toFixed(1)} expected catches</span>
                  </div>
                  {res.mapsUrl && (
                    <a href={res.mapsUrl} target="_blank" rel="noopener" className="btn-green">
                      <Navigation className="h-4 w-4" /> Open in Google Maps
                    </a>
                  )}
                </div>
                <ol className="mt-4 divide-y divide-line">
                  {res.stops.map((s) => (
                    <li key={s.id} className="flex gap-3 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-volt font-black text-slate-950">{s.order}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/machines/${s.id}`} className="block truncate font-semibold text-white hover:text-volt">{s.label}</Link>
                        <p className="text-xs text-muted">
                          {s.legMiles.toFixed(1)} mi · {s.legMin} min drive{s.waitMin > 0 ? ` · wait ${s.waitMin} min` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-green-400">Drop {fmt(s.dropMs)}</p>
                        <p className="text-xs text-muted">arrive {fmt(s.arriveMs)}</p>
                        <p className={`text-[10px] font-semibold ${s.confidence >= 0.9 ? "text-green-400" : "text-orange-300"}`}>
                          {s.confidence >= 0.9 ? "✔" : "?"} {Math.round(s.confidence * 100)}% sure
                        </p>
                        <div className="mt-1.5 flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => recordStopCheckin(s.id, "dropped", s.dropMs)}
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold transition ${
                              checkins[s.id] === "dropped"
                                ? "border-green-400 bg-green-500/20 text-green-300"
                                : "border-line text-muted hover:border-green-400/50 hover:text-white"
                            }`}
                          >
                            {checkins[s.id] === "dropped" ? "🟢 Logged Hit!" : "🟢 Hit"}
                          </button>
                          <button
                            type="button"
                            onClick={() => recordStopCheckin(s.id, "no_drop", s.dropMs)}
                            className={`rounded border px-2 py-0.5 text-[10px] font-bold transition ${
                              checkins[s.id] === "no_drop"
                                ? "border-red-400 bg-red-500/20 text-red-300"
                                : "border-line text-muted hover:border-red-400/50 hover:text-white"
                            }`}
                          >
                            {checkins[s.id] === "no_drop" ? "🚫 Logged Miss" : "🚫 Missed"}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
            {res.skipped.length > 0 && (
              <details className="mt-4 text-sm text-muted">
                <summary className="cursor-pointer">{res.skipped.length} machines not in the plan</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {res.skipped.map((s) => (
                    <li key={s.id}>{s.label} · <span className="text-orange-300">{s.reason}</span></li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="font-mono font-bold text-white">{value}{unit ? ` ${unit}` : ""}</span>
      </div>
      <input type="range" className="w-full accent-yellow-400" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

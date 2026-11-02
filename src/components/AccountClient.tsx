"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Trash2, BellRing } from "lucide-react";
import { enablePush } from "./ServiceWorker";

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Failed");
  return j;
}

export type SubView = { id: string; kind: string; title: string; href?: string; lead: number; channels: string[]; active: boolean };

const KIND: Record<string, string> = {
  machine_drop: "Machine drop",
  schedule_change: "Drop-time change",
  area_drop: "Near me",
  product_restock: "Restock",
  release: "New releases",
  news: "News",
};

export function AlertsManager({ subs, plan, maxAlerts, maxLead, homeZip }: { subs: SubView[]; plan: string; maxAlerts: number; maxLead: number; homeZip: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [zip, setZip] = useState(homeZip ?? "");
  const [radius, setRadius] = useState(10);
  const [lead, setLead] = useState(5);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <p className="rounded-lg bg-panel-2 p-3 text-sm text-slate-200">{msg}</p>}
      <div className="card p-5">
        <p className="font-bold text-white">Quick add</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-panel-2 p-3">
            <p className="text-sm font-semibold text-white">Machines near a ZIP</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="input w-28" placeholder="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={5} />
              <select className="input w-28" value={radius} onChange={(e) => setRadius(Number(e.target.value))}>{[3, 5, 10, 15, 25, 50].map((r) => <option key={r} value={r}>{r} mi</option>)}</select>
              <select className="input w-32" value={lead} onChange={(e) => setLead(Number(e.target.value))}>
                {[2, 5, 10, 15, 30, 60].filter((l) => l <= maxLead).map((l) => <option key={l} value={l}>{l} min before</option>)}
              </select>
              <button className="btn-primary" onClick={() => act(() => call("/api/alerts", "POST", { kind: "area_drop", zip, radiusMiles: radius, leadMinutes: lead }), "Area alert added")}>Add</button>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-xl bg-panel-2 p-3">
            <p className="text-sm font-semibold text-white">Site-wide</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={() => act(() => call("/api/alerts", "POST", { kind: "release" }), "Release alert added")}>🗓️ New set releases</button>
              <button className="btn-ghost" onClick={() => act(() => call("/api/alerts", "POST", { kind: "news", keyword: "vending" }), "News alert added")}>📰 Vending news</button>
              <button className="btn-ghost" onClick={() => act(() => call("/api/alerts", "POST", { kind: "product_restock" }), "Restock alert added")}>🛒 Any restock</button>
            </div>
            <button
              className="btn-ghost w-fit"
              onClick={async () => {
                const r = await enablePush();
                setMsg(r === "ok" ? "Push notifications enabled on this device" : r);
              }}
            >
              <BellRing className="h-4 w-4" /> Enable push on this device
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Active alerts: <b className="text-white">{subs.filter((s) => s.active).length}/{maxAlerts}</b> · up to {maxLead} min lead time before each drop.
        </p>
      </div>

      <div className="card divide-y divide-line">
        {subs.length === 0 && <p className="p-5 text-sm text-muted">No alerts yet. Open any machine and tap “Alert me”.</p>}
        {subs.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
            <input type="checkbox" checked={s.active} onChange={(e) => act(() => call("/api/alerts", "PATCH", { id: s.id, active: e.target.checked }))} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {s.href ? <Link href={s.href} className="hover:text-volt">{s.title}</Link> : s.title}
              </p>
              <p className="text-xs text-muted">{KIND[s.kind] ?? s.kind}{["machine_drop", "area_drop"].includes(s.kind) ? ` · ${s.lead} min before` : ""} · {s.channels.join(", ")}</p>
            </div>
            <button className="text-muted hover:text-red-300" onClick={() => act(() => call(`/api/alerts?id=${s.id}`, "DELETE"))} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfileForm({ name, homeZip, discord, qs, qe }: { name: string; homeZip: string | null; discord: string | null; qs: number | null; qe: number | null }) {
  const router = useRouter();
  const [v, setV] = useState({ name, homeZip: homeZip ?? "", discord: discord ?? "", qs: qs == null ? "" : toTime(qs), qe: qe == null ? "" : toTime(qe) });
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (test = false) => {
    try {
      await call("/api/me", "PATCH", {
        name: v.name,
        homeZip: v.homeZip || null,
        discordWebhookUrl: v.discord || "",
        quietHoursStart: v.qs ? fromTime(v.qs) : null,
        quietHoursEnd: v.qe ? fromTime(v.qe) : null,
        testDiscord: test,
      });
      setMsg(test ? "Test sent to Discord!" : "Saved");
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="card max-w-xl space-y-3 p-5">
      <label className="block text-sm">Display name<input className="input mt-1" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="block text-sm">Home ZIP<input className="input mt-1" maxLength={5} value={v.homeZip} onChange={(e) => setV({ ...v, homeZip: e.target.value })} /></label>
      <label className="block text-sm">Discord webhook URL <span className="text-xs text-muted">(Server settings → Integrations → Webhooks)</span>
        <input className="input mt-1" value={v.discord} onChange={(e) => setV({ ...v, discord: e.target.value })} placeholder="https://discord.com/api/webhooks/…" /></label>
      <div className="flex items-center gap-3 text-sm">
        <span>Quiet hours</span>
        <input type="time" className="input w-32" value={v.qs} onChange={(e) => setV({ ...v, qs: e.target.value })} />
        <span>to</span>
        <input type="time" className="input w-32" value={v.qe} onChange={(e) => setV({ ...v, qe: e.target.value })} />
      </div>
      <div className="flex gap-2">
        <button className="btn-primary" onClick={() => save()}>Save</button>
        {v.discord && <button className="btn-ghost" onClick={() => save(true)}>Save &amp; test Discord</button>}
      </div>
      {msg && <p className="text-sm text-slate-300">{msg}</p>}
    </div>
  );
}

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function PremiumButton({ premium, signedIn }: { premium: boolean; signedIn: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button
        className="btn-primary"
        onClick={async () => {
          if (!signedIn) return router.push("/sign-up");
          try {
            const j = await call("/api/premium", "POST");
            setMsg(j.error ?? (j.dev ? `Dev mode: plan is now ${j.plan}` : "Done"));
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        {premium ? "Manage / toggle (dev)" : "Go Premium"}
      </button>
      {msg && <p className="mt-2 text-sm text-slate-300">{msg}</p>}
    </div>
  );
}

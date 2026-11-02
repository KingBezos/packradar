"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Adapter = { name: string; label: string; description: string; running: boolean };
type Run = { id: string; adapter: string; status: string; startedAt: string; itemsFound: number; itemsCreated: number; error: string | null; log: string | null };

async function call(url: string, method = "POST", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Failed");
  return j;
}

export function AdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<{ adapters: Adapter[]; runs: Run[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();
  const load = () => call("/api/admin/scrape", "GET").then(setData).catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const run = async (adapter: string, options?: Record<string, unknown>) => {
    try {
      await call("/api/admin/scrape", "POST", { adapter, options });
      setMsg(`Started ${adapter}`);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const admin = async (body: Record<string, unknown>, ok: string) => {
    try {
      await call("/api/admin", "POST", body);
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const [role, setRole] = useState({ userId: "", role: "mod" });
  const [news, setNews] = useState({ title: "", summary: "" });
  const [sp, setSp] = useState({ name: "", tagline: "", url: "", city: "", state: "", lat: "", lng: "", radius: "25" });

  return (
    <div className="space-y-8">
      {msg && <p className="rounded-lg bg-panel-2 p-3 text-sm">{msg}</p>}
      <section>
        <h2 className="mb-3 text-xl font-bold text-white">Scrapers</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {data?.adapters.map((a) => (
            <div key={a.name} className="card p-4">
              <p className="font-semibold text-white">{a.label} {a.running && <span className="ml-1 animate-pulse text-xs text-green-400">running…</span>}</p>
              <p className="text-xs text-muted">{a.description}</p>
              {isAdmin && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-ghost py-1.5" disabled={a.running} onClick={() => run(a.name, a.name === "official-locator" ? { mode: "metros" } : {})}>
                    Run{a.name === "official-locator" ? " (metros)" : ""}
                  </button>
                  {a.name === "official-locator" && <button className="btn-ghost py-1.5" disabled={a.running} onClick={() => run(a.name, { mode: "full" })}>Run full US scan</button>}
                </div>
              )}
            </div>
          ))}
        </div>
        {isAdmin && <button className="btn-primary mt-3" onClick={() => run("daily")}>Run entire daily job</button>}
        <div className="card mt-4 divide-y divide-line">
          {data?.runs.map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span><b className="text-white">{r.adapter}</b> <span className={r.status === "success" ? "text-green-400" : r.status === "failed" ? "text-red-400" : "text-yellow-300"}>{r.status}</span></span>
                <span className="text-xs text-muted">{new Date(r.startedAt).toLocaleString()} · {r.itemsFound} found · {r.itemsCreated} new</span>
              </button>
              {open === r.id && <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-bg p-3 text-[11px] text-slate-300">{r.error ? `ERROR: ${r.error}\n` : ""}{r.log}</pre>}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <>
          <section className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-2 p-4">
              <h3 className="font-bold text-white">Set user role</h3>
              <input className="input" placeholder="User ID" value={role.userId} onChange={(e) => setRole({ ...role, userId: e.target.value })} />
              <select className="input" value={role.role} onChange={(e) => setRole({ ...role, role: e.target.value })}><option>user</option><option>mod</option><option>admin</option></select>
              <button className="btn-ghost" onClick={() => admin({ action: "user.role", ...role }, "Role updated")}>Update</button>
            </div>
            <div className="card space-y-2 p-4">
              <h3 className="font-bold text-white">Post news</h3>
              <input className="input" placeholder="Title" value={news.title} onChange={(e) => setNews({ ...news, title: e.target.value })} />
              <textarea className="input" placeholder="Summary" value={news.summary} onChange={(e) => setNews({ ...news, summary: e.target.value })} />
              <button className="btn-ghost" onClick={() => admin({ action: "news.create", ...news, category: "general" }, "Posted")}>Publish</button>
            </div>
            <div className="card space-y-2 p-4 md:col-span-2">
              <h3 className="font-bold text-white">Add local sponsor</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["name", "tagline", "url", "city", "state", "lat", "lng", "radius"] as const).map((k) => (
                  <input key={k} className="input" placeholder={k} value={sp[k]} onChange={(e) => setSp({ ...sp, [k]: e.target.value })} />
                ))}
              </div>
              <button
                className="btn-ghost"
                onClick={() =>
                  admin(
                    {
                      action: "sponsor.create", name: sp.name, kind: "local_vendor", tagline: sp.tagline || undefined, url: sp.url,
                      city: sp.city || undefined, state: sp.state || undefined,
                      lat: sp.lat ? Number(sp.lat) : undefined, lng: sp.lng ? Number(sp.lng) : undefined, radiusMiles: Number(sp.radius) || 25,
                    },
                    "Sponsor added",
                  )
                }
              >Add sponsor</button>
            </div>
            <div className="card space-y-2 p-4 md:col-span-2">
              <h3 className="font-bold text-white">Launch checklist</h3>
              <p className="text-xs text-muted">Remove the demo drop schedules once real data (scraped + community) is flowing.</p>
              <button className="btn-red" onClick={() => confirm("Remove ALL demo schedules?") && admin({ action: "seed.purge" }, "Demo data purged")}>Purge demo schedules</button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

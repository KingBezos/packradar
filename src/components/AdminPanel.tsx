"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Users, ShieldCheck, Trash2, Search, RefreshCw, Bot, Newspaper } from "lucide-react";
import { Avatar, timeAgo } from "./ui";

type Adapter = { name: string; label: string; description: string; running: boolean };
type Run = {
  id: string;
  adapter: string;
  status: string;
  startedAt: string;
  itemsFound: number;
  itemsCreated: number;
  error: string | null;
  log: string | null;
};
type ManagedUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: "user" | "mod" | "admin";
  reputation: number;
  plan: "free" | "premium";
  homeZip: string | null;
  createdAt: string;
  providers: string[];
  activeAlerts: number;
};

async function call(url: string, method = "POST", body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Failed");
  return j;
}

export function AdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<{ adapters: Adapter[]; runs: Run[] } | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const router = useRouter();

  const loadScrapers = () =>
    call("/api/admin/scrape", "GET")
      .then(setData)
      .catch((e) => setMsg(e.message));

  const loadUsers = () =>
    call("/api/admin/users", "GET")
      .then((res) => setUsers(res.users ?? []))
      .catch((e) => setMsg(e.message));

  useEffect(() => {
    loadScrapers();
    loadUsers();
    const t = setInterval(loadScrapers, 6000);
    return () => clearInterval(t);
  }, []);

  const run = async (adapter: string, options?: Record<string, unknown>) => {
    try {
      await call("/api/admin/scrape", "POST", { adapter, options });
      setMsg(`Started ${adapter}`);
      loadScrapers();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const patchUser = async (userId: string, patch: Record<string, unknown>, okMsg: string) => {
    try {
      await call("/api/admin/users", "PATCH", { userId, ...patch });
      setMsg(okMsg);
      loadUsers();
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const deleteUser = async (u: ManagedUser) => {
    if (!confirm(`Delete user "${u.name}" (${u.email})? This cannot be undone.`)) return;
    try {
      await call(`/api/admin/users?id=${encodeURIComponent(u.id)}`, "DELETE");
      setMsg(`Deleted user ${u.name}`);
      loadUsers();
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

  const [news, setNews] = useState({ title: "", summary: "" });
  const [sp, setSp] = useState({ name: "", tagline: "", url: "", city: "", state: "", lat: "", lng: "", radius: "25" });

  const filteredUsers = users.filter((u) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      (u.homeZip ?? "").includes(q)
    );
  });

  return (
    <div className="space-y-10">
      {msg && (
        <div className="flex items-center justify-between rounded-xl border border-volt/40 bg-panel-2 px-4 py-3 text-sm text-white">
          <span>{msg}</span>
          <button className="text-xs text-muted hover:text-white" onClick={() => setMsg(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* 1. REGISTERED USERS MANAGEMENT SECTION */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
              <Users className="h-6 w-6 text-volt" /> Registered Users ({users.length})
            </h2>
            <p className="text-xs text-muted">
              View and manage all signed-up collectors, display handles, roles, reputation, plans, and email verification.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                className="input w-64 pl-9 text-xs"
                placeholder="Search handle, email, ZIP, role…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
            <button className="btn-ghost py-2 text-xs" onClick={loadUsers}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* User Stats Summary Pills */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Total Users</p>
            <p className="mt-1 font-mono text-2xl font-black text-white">{users.length}</p>
          </div>
          <div className="card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Verified Emails</p>
            <p className="mt-1 font-mono text-2xl font-black text-green-400">
              {users.filter((u) => u.emailVerified).length}
            </p>
          </div>
          <div className="card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Google Sign-In</p>
            <p className="mt-1 font-mono text-2xl font-black text-sky-300">
              {users.filter((u) => u.providers.includes("google")).length}
            </p>
          </div>
          <div className="card p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Admins &amp; Mods</p>
            <p className="mt-1 font-mono text-2xl font-black text-volt">
              {users.filter((u) => u.role === "admin" || u.role === "mod").length}
            </p>
          </div>
        </div>

        {/* Users Table */}
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-panel-2/70 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Spotter Handle</th>
                <th className="px-4 py-3">Email &amp; Auth</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Reputation</th>
                <th className="px-4 py-3">ZIP / Alerts</th>
                <th className="px-4 py-3">Joined</th>
                {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-sm text-muted">
                    No users match your filter.
                  </td>
                </tr>
              )}
              {filteredUsers.map((u) => {
                const draftName = editingNames[u.id] ?? u.name;
                return (
                  <tr key={u.id} className="hover:bg-panel-2/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={u.name} size={28} />
                        {isAdmin ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="input w-36 px-2 py-1 text-xs font-semibold"
                              value={draftName}
                              onChange={(e) => setEditingNames({ ...editingNames, [u.id]: e.target.value })}
                            />
                            {draftName !== u.name && (
                              <button
                                className="rounded bg-volt px-2 py-1 text-[10px] font-bold text-slate-950"
                                onClick={() => patchUser(u.id, { name: draftName }, `Updated handle to ${draftName}`)}
                              >
                                Save
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="font-bold text-white">{u.name}</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{u.email}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {u.providers.includes("google") && (
                          <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">
                            Google OAuth
                          </span>
                        )}
                        {u.providers.includes("credential") && (
                          <span className="rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                            Email/Password
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() =>
                            patchUser(
                              u.id,
                              { emailVerified: !u.emailVerified },
                              `Email verification set to ${!u.emailVerified}`,
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            u.emailVerified
                              ? "bg-green-500/15 text-green-400"
                              : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {u.emailVerified ? "Verified" : "Unverified"}
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <select
                        className="input w-24 px-2 py-1 text-xs"
                        disabled={!isAdmin}
                        value={u.role}
                        onChange={(e) =>
                          patchUser(u.id, { role: e.target.value }, `Role updated to ${e.target.value}`)
                        }
                      >
                        <option value="user">user</option>
                        <option value="mod">mod</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      <select
                        className="input w-24 px-2 py-1 text-xs"
                        disabled={!isAdmin}
                        value={u.plan}
                        onChange={(e) =>
                          patchUser(u.id, { plan: e.target.value }, `Plan updated to ${e.target.value}`)
                        }
                      >
                        <option value="free">free</option>
                        <option value="premium">premium</option>
                      </select>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-volt">{u.reputation}</span>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button
                              className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] hover:border-volt"
                              onClick={() =>
                                patchUser(u.id, { reputation: u.reputation + 10 }, `Added +10 rep to ${u.name}`)
                              }
                            >
                              +10
                            </button>
                            <button
                              className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] hover:border-red-400"
                              onClick={() =>
                                patchUser(u.id, { reputation: u.reputation - 10 }, `Subtracted 10 rep from ${u.name}`)
                              }
                            >
                              -10
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-slate-300">
                      <div>ZIP: {u.homeZip || "—"}</div>
                      <div className="text-[10px] text-muted">{u.activeAlerts} active alerts</div>
                    </td>

                    <td className="px-4 py-3 text-muted">{timeAgo(u.createdAt)}</td>

                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded-lg p-1.5 text-muted hover:bg-red-500/15 hover:text-red-300"
                          onClick={() => deleteUser(u)}
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. WORKER BOTS & SCRAPERS SECTION */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-white">
              <Bot className="h-5 w-5 text-volt" /> Autonomous Worker Bots &amp; Scrapers
            </h2>
            <p className="text-xs text-muted">
              Background bots for QA site health auditing, 6-hour original Pokémon news writing, retail stock scanning, and drop calibration.
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost text-xs" onClick={() => run("qa-auditor")}>
                <ShieldCheck className="h-4 w-4 text-green-400" /> Run Site QA Auditor Bot
              </button>
              <button className="btn-ghost text-xs" onClick={() => run("news-feeds")}>
                <Newspaper className="h-4 w-4 text-volt" /> Run 6h Editorial News Bot
              </button>
              <button className="btn-primary text-xs" onClick={() => run("daily")}>
                Run All Daily Jobs
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {data?.adapters.map((a) => (
            <div key={a.name} className="card p-4">
              <p className="font-semibold text-white">
                {a.label}{" "}
                {a.running && <span className="ml-1 animate-pulse text-xs text-green-400">running…</span>}
              </p>
              <p className="text-xs text-muted">{a.description}</p>
              {isAdmin && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn-ghost py-1.5 text-xs"
                    disabled={a.running}
                    onClick={() => run(a.name, a.name === "official-locator" ? { mode: "metros" } : {})}
                  >
                    Run Now{a.name === "official-locator" ? " (metros)" : ""}
                  </button>
                  {a.name === "official-locator" && (
                    <button
                      className="btn-ghost py-1.5 text-xs"
                      disabled={a.running}
                      onClick={() => run(a.name, { mode: "full" })}
                    >
                      Run full US scan
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card mt-4 divide-y divide-line">
          {data?.runs.map((r) => (
            <div key={r.id} className="p-3 text-sm">
              <button
                className="flex w-full items-center justify-between text-left"
                onClick={() => setOpen(open === r.id ? null : r.id)}
              >
                <span>
                  <b className="text-white">{r.adapter}</b>{" "}
                  <span
                    className={
                      r.status === "success"
                        ? "text-green-400"
                        : r.status === "failed"
                          ? "text-red-400"
                          : "text-yellow-300"
                    }
                  >
                    {r.status}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {new Date(r.startedAt).toLocaleString()} · {r.itemsFound} checked · {r.itemsCreated} new
                </span>
              </button>
              {open === r.id && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-bg p-3 text-[11px] text-slate-300">
                  {r.error ? `ERROR: ${r.error}\n` : ""}
                  {r.log}
                </pre>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card space-y-2 p-4">
            <h3 className="font-bold text-white">Publish Custom News Article</h3>
            <input
              className="input"
              placeholder="Title"
              value={news.title}
              onChange={(e) => setNews({ ...news, title: e.target.value })}
            />
            <textarea
              className="input"
              placeholder="Summary / Article body"
              value={news.summary}
              onChange={(e) => setNews({ ...news, summary: e.target.value })}
            />
            <button
              className="btn-ghost"
              onClick={() => admin({ action: "news.create", ...news, category: "general" }, "Article published")}
            >
              Publish
            </button>
          </div>
          <div className="card space-y-2 p-4">
            <h3 className="font-bold text-white">Add Local Sponsor</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["name", "tagline", "url", "city", "state", "radius"] as const).map((k) => (
                <input
                  key={k}
                  className="input text-xs"
                  placeholder={k}
                  value={sp[k]}
                  onChange={(e) => setSp({ ...sp, [k]: e.target.value })}
                />
              ))}
            </div>
            <button
              className="btn-ghost"
              onClick={() =>
                admin(
                  {
                    action: "sponsor.create",
                    name: sp.name,
                    kind: "local_vendor",
                    tagline: sp.tagline || undefined,
                    url: sp.url,
                    city: sp.city || undefined,
                    state: sp.state || undefined,
                    radiusMiles: Number(sp.radius) || 25,
                  },
                  "Sponsor added",
                )
              }
            >
              Add sponsor
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

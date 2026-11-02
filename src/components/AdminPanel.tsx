"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  Trash2,
  Search,
  RefreshCw,
  Bot,
  Newspaper,
  AlertTriangle,
  MapPin,
  ShoppingCart,
  Store,
  Edit3,
  Pin,
  Plus,
  ExternalLink,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { Avatar, CATEGORY_LABEL, timeAgo } from "./ui";
import type { AdminInboxItem } from "@/app/api/contact/route";

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
type NewsArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string | null;
  category: string;
  imageUrl: string | null;
  sourceName: string | null;
  author: string;
  pinned: boolean;
  publishedAt: string;
};
type ManagedMachine = {
  id: string;
  retailer: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  status: "active" | "broken" | "removed" | "unverified";
  stockStatus: "stocked" | "low" | "out" | "unknown";
  intervalMinutes: number | null;
  anchorMinute: number | null;
  accuracy: number | null;
  scheduleVerified: boolean;
};
type RetailRow = {
  listing: {
    id: string;
    retailer: string;
    url: string;
    inStock: boolean;
    price: number | null;
    lastCheckedAt: string | null;
  };
  product: {
    id: string;
    name: string;
    setName: string | null;
    msrp: number | null;
  };
};
type SponsorRow = {
  id: string;
  name: string;
  kind: string;
  tagline: string | null;
  url: string;
  city: string | null;
  state: string | null;
  radiusMiles: number | null;
  active: boolean;
  impressions: number;
  clicks: number;
};
type CommentRow = {
  comment: {
    id: string;
    targetType: string;
    targetId: string;
    body: string;
    createdAt: string;
  };
  authorName: string | null;
  authorEmail: string | null;
  flagCount?: number;
  flagReasons?: string[];
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

type TabKey = "inbox" | "news" | "users" | "machines" | "comments" | "retail" | "bots";

export function AdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("inbox");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  // 1. Inbox (Admin Alerts + Vendor Sales Inquiries)
  const [inbox, setInbox] = useState<AdminInboxItem[]>([]);
  const [inboxFilter, setInboxFilter] = useState<"all" | "open" | "vendor_sales" | "admin_alert">("all");

  // 2. Users
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});

  // 3. Content (News, Machines, Retail, Sponsors, Comments)
  const [newsList, setNewsList] = useState<NewsArticle[]>([]);
  const [newsSearch, setNewsSearch] = useState("");
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null);
  const [creatingNews, setCreatingNews] = useState(false);
  const [newArticle, setNewArticle] = useState({
    title: "",
    category: "tcg",
    imageUrl: "https://images.pokemontcg.io/sv8pt5/161_hires.png",
    summary: "",
    body: "",
    pinned: false,
  });

  const [machines, setMachines] = useState<ManagedMachine[]>([]);
  const [machineSearch, setMachineSearch] = useState("");
  const [machineDrafts, setMachineDrafts] = useState<Record<string, Partial<ManagedMachine>>>({});

  const [retail, setRetail] = useState<RetailRow[]>([]);
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentFilter, setCommentFilter] = useState<"all" | "flagged">("all");
  const [editingComment, setEditingComment] = useState<Record<string, string>>({});
  const [spForm, setSpForm] = useState({
    name: "",
    tagline: "",
    url: "",
    city: "",
    state: "",
    radius: "25",
  });

  // 4. Scrapers & Bots
  const [scrapers, setScrapers] = useState<{ adapters: Adapter[]; runs: Run[] } | null>(null);
  const [openLog, setOpenLog] = useState<string | null>(null);

  const loadInbox = () =>
    call("/api/contact", "GET")
      .then((r) => setInbox(r.items ?? []))
      .catch((e) => setMsg(e.message));

  const loadUsers = () =>
    call("/api/admin/users", "GET")
      .then((r) => setUsers(r.users ?? []))
      .catch((e) => setMsg(e.message));

  const loadContent = () =>
    call("/api/admin/content", "GET")
      .then((r) => {
        setNewsList(r.news ?? []);
        setMachines(r.machines ?? []);
        setRetail(r.retail ?? []);
        setSponsors(r.sponsors ?? []);
        setComments(r.comments ?? []);
      })
      .catch((e) => setMsg(e.message));

  const loadScrapers = () =>
    call("/api/admin/scrape", "GET")
      .then(setScrapers)
      .catch((e) => setMsg(e.message));

  useEffect(() => {
    loadInbox();
    loadUsers();
    loadContent();
    loadScrapers();
    const t = setInterval(loadScrapers, 8000);
    return () => clearInterval(t);
  }, []);

  /* ── Handlers ── */
  const toggleInboxStatus = async (item: AdminInboxItem) => {
    const next = item.status === "open" ? "resolved" : "open";
    await call("/api/contact", "PATCH", { id: item.id, status: next });
    setMsg(`Marked "${item.subject}" as ${next}`);
    loadInbox();
  };

  const deleteInboxItem = async (id: string) => {
    await call(`/api/contact?id=${encodeURIComponent(id)}`, "DELETE");
    setMsg("Removed item from Admin Inbox");
    loadInbox();
  };

  const createNewsArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await call("/api/admin/content", "POST", newArticle);
      setMsg(`Published article "${newArticle.title}"`);
      setNewArticle({
        title: "",
        category: "tcg",
        imageUrl: "https://images.pokemontcg.io/sv8pt5/161_hires.png",
        summary: "",
        body: "",
        pinned: false,
      });
      setCreatingNews(false);
      loadContent();
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const saveEditedArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle) return;
    try {
      await call("/api/admin/content", "PATCH", {
        entity: "news",
        id: editingArticle.id,
        title: editingArticle.title,
        summary: editingArticle.summary,
        body: editingArticle.body,
        category: editingArticle.category,
        imageUrl: editingArticle.imageUrl,
        sourceName: editingArticle.sourceName,
        author: editingArticle.author,
        pinned: editingArticle.pinned,
      });
      setMsg(`Saved changes to "${editingArticle.title}"`);
      setEditingArticle(null);
      loadContent();
      router.refresh();
    } catch (err) {
      setMsg((err as Error).message);
    }
  };

  const togglePinNews = async (art: NewsArticle) => {
    await call("/api/admin/content", "PATCH", {
      entity: "news",
      id: art.id,
      pinned: !art.pinned,
    });
    setMsg(`${!art.pinned ? "Pinned" : "Unpinned"} "${art.title}"`);
    loadContent();
  };

  const deleteNewsArticle = async (art: NewsArticle) => {
    if (!confirm(`Delete news article "${art.title}"?`)) return;
    await call(`/api/admin/content?entity=news&id=${encodeURIComponent(art.id)}`, "DELETE");
    setMsg(`Deleted "${art.title}"`);
    loadContent();
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

  const saveMachine = async (m: ManagedMachine) => {
    const draft = machineDrafts[m.id] ?? {};
    try {
      await call("/api/admin/content", "PATCH", {
        entity: "machine",
        id: m.id,
        ...draft,
      });
      setMsg(`Updated machine ${m.id} (${m.retailer} ${m.city})`);
      const nextDrafts = { ...machineDrafts };
      delete nextDrafts[m.id];
      setMachineDrafts(nextDrafts);
      loadContent();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const toggleRetailStock = async (r: RetailRow) => {
    await call("/api/admin/content", "PATCH", {
      entity: "retail",
      id: r.listing.id,
      inStock: !r.listing.inStock,
    });
    setMsg(`Set ${r.product.name} (${r.listing.retailer}) to ${!r.listing.inStock ? "IN STOCK" : "OUT OF STOCK"}`);
    loadContent();
  };

  const toggleSponsor = async (s: SponsorRow) => {
    await call("/api/admin/content", "PATCH", {
      entity: "sponsor",
      id: s.id,
      active: !s.active,
    });
    setMsg(`Sponsor "${s.name}" ${!s.active ? "enabled" : "paused"}`);
    loadContent();
  };

  const deleteEntity = async (entity: "sponsor" | "retail" | "comment", id: string | number, label: string) => {
    if (!confirm(`Delete ${label}?`)) return;
    await call(`/api/admin/content?entity=${entity}&id=${encodeURIComponent(String(id))}`, "DELETE");
    setMsg(`Deleted ${label}`);
    loadContent();
  };

  const saveCommentBody = async (id: string, body: string) => {
    await call("/api/admin/content", "PATCH", { entity: "comment", id, body });
    setMsg("Updated comment text");
    const next = { ...editingComment };
    delete next[id];
    setEditingComment(next);
    loadContent();
  };

  const clearCommentFlags = async (commentId: string) => {
    await call(`/api/comments/flag?commentId=${encodeURIComponent(commentId)}`, "DELETE");
    setMsg("Cleared flags on comment");
    loadContent();
  };

  const flaggedCommentsCount = comments.filter((c) => (c.flagCount ?? 0) >= 2).length;

  const createSponsor = async () => {
    try {
      await call("/api/admin", "POST", {
        action: "sponsor.create",
        name: spForm.name,
        kind: "local_vendor",
        tagline: spForm.tagline || undefined,
        url: spForm.url,
        city: spForm.city || undefined,
        state: spForm.state || undefined,
        radiusMiles: Number(spForm.radius) || 25,
      });
      setMsg(`Added sponsor "${spForm.name}"`);
      setSpForm({ name: "", tagline: "", url: "", city: "", state: "", radius: "25" });
      loadContent();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const runBot = async (adapter: string, options?: Record<string, unknown>) => {
    try {
      await call("/api/admin/scrape", "POST", { adapter, options });
      setMsg(`Started ${adapter}`);
      loadScrapers();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const openAlertsCount = inbox.filter((i) => i.status === "open").length;

  const filteredInbox = inbox.filter((i) => {
    if (inboxFilter === "open") return i.status === "open";
    if (inboxFilter === "vendor_sales") return i.kind === "vendor_sales";
    if (inboxFilter === "admin_alert") return i.kind === "admin_alert";
    return true;
  });

  const filteredNews = newsList.filter((n) => {
    const q = newsSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      n.title.toLowerCase().includes(q) ||
      n.category.toLowerCase().includes(q) ||
      (n.summary ?? "").toLowerCase().includes(q)
    );
  });

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

  const filteredMachines = machines
    .filter((m) => {
      const q = machineSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.retailer.toLowerCase().includes(q) ||
        m.city.toLowerCase().includes(q) ||
        m.state.toLowerCase().includes(q) ||
        m.zip.includes(q) ||
        m.street.toLowerCase().includes(q)
      );
    })
    .slice(0, 60);

  return (
    <div className="space-y-6">
      {msg && (
        <div className="flex items-center justify-between rounded-xl border border-volt/40 bg-panel-2 px-4 py-3 text-sm text-white">
          <span>⚡ {msg}</span>
          <button className="text-xs text-muted hover:text-white" onClick={() => setMsg(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Top Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-4">
        <button
          type="button"
          onClick={() => setTab("inbox")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "inbox"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          Alerts &amp; Sales Inbox
          {openAlertsCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
              {openAlertsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab("news")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "news"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <Newspaper className="h-4 w-4" />
          News Articles ({newsList.length})
        </button>

        <button
          type="button"
          onClick={() => setTab("users")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "users"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <Users className="h-4 w-4" />
          Users ({users.length})
        </button>

        <button
          type="button"
          onClick={() => setTab("machines")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "machines"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <MapPin className="h-4 w-4" />
          Vending Machines ({machines.length})
        </button>

        <button
          type="button"
          onClick={() => setTab("comments")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "comments"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <MessageSquare className="h-4 w-4" />
          Comments ({comments.length})
          {flaggedCommentsCount > 0 && (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
              🚩 {flaggedCommentsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab("retail")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "retail"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Retail Drops &amp; Sponsors
        </button>

        <button
          type="button"
          onClick={() => setTab("bots")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "bots"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <Bot className="h-4 w-4" />
          Worker Bots &amp; Scrapers
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 1: ADMIN ALERTS & VENDOR SALES INBOX
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "inbox" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <AlertTriangle className="h-6 w-6 text-amber-300" /> Admin Alerts &amp; Vendor Inquiries ({inbox.length})
              </h2>
              <p className="text-xs text-muted">
                User-submitted &ldquo;Alert Admin&rdquo; issue reports (wrong drop times, dead machines, site bugs) and
                Vendor/Sales inquiries emailed to <b className="text-slate-200">james@jpegtown.com</b>.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["all", `All (${inbox.length})`],
                  ["open", `Open (${openAlertsCount})`],
                  ["admin_alert", "Site / Machine Alerts"],
                  ["vendor_sales", "Vendor / Sales Inquiries"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setInboxFilter(k)}
                  className={`chip text-xs ${inboxFilter === k ? "border-volt text-volt" : ""}`}
                >
                  {label}
                </button>
              ))}
              <button className="btn-ghost py-1.5 text-xs" onClick={loadInbox}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          {filteredInbox.length === 0 ? (
            <div className="card p-8 text-center text-sm text-muted">
              No alerts or vendor inquiries in this view yet. Try clicking the &ldquo;Alert Admin&rdquo; button in the top navbar to test!
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInbox.map((item) => (
                <div
                  key={item.id}
                  className={`card p-5 transition ${
                    item.status === "open" ? "border-amber-400/40" : "opacity-65"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                            item.kind === "vendor_sales"
                              ? "bg-volt/20 text-volt border border-volt/40"
                              : "bg-amber-500/20 text-amber-300 border border-amber-400/40"
                          }`}
                        >
                          {item.kind === "vendor_sales" ? "💼 Vendor / Sales Inquiry" : `🚨 Alert: ${item.category}`}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            item.status === "open"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-green-500/20 text-green-400"
                          }`}
                        >
                          {item.status}
                        </span>
                        {item.machineId && (
                          <Link
                            href={`/machines/${item.machineId}`}
                            className="rounded bg-panel-2 px-2 py-0.5 font-mono text-xs font-bold text-volt hover:underline"
                          >
                            Machine {item.machineId} ↗
                          </Link>
                        )}
                        {item.pageUrl && (
                          <Link href={item.pageUrl} className="text-xs text-muted hover:text-white">
                            Page: {item.pageUrl}
                          </Link>
                        )}
                        <span className="text-xs text-muted">· {timeAgo(item.createdAt)}</span>
                      </div>

                      <h3 className="text-base font-bold text-white">{item.subject}</h3>
                      <p className="whitespace-pre-wrap text-sm text-slate-200">{item.message}</p>

                      <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-muted">
                        <span>
                          From: <b className="text-slate-300">{item.senderName || "Anonymous"}</b>
                        </span>
                        {item.senderEmail && (
                          <a href={`mailto:${item.senderEmail}`} className="text-volt hover:underline">
                            Reply: {item.senderEmail}
                          </a>
                        )}
                        {item.businessName && <span>Shop: {item.businessName}</span>}
                        {item.cityState && <span>Area: {item.cityState}</span>}
                        {item.website && (
                          <a
                            href={item.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-300 hover:underline"
                          >
                            {item.website} ↗
                          </a>
                        )}
                        {item.kind === "vendor_sales" && (
                          <span className="text-green-400">
                            ✉️ Email to james@jpegtown.com: {item.emailStatus}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleInboxStatus(item)}
                        className="btn-ghost py-1.5 text-xs"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                        {item.status === "open" ? "Mark Resolved" : "Reopen"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteInboxItem(item.id)}
                        className="rounded-lg p-2 text-muted hover:bg-red-500/15 hover:text-red-300"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 2: NEWS ARTICLES MANAGER (Create, Edit, Pin, Delete)
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "news" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <Newspaper className="h-6 w-6 text-volt" /> News Articles Manager ({newsList.length})
              </h2>
              <p className="text-xs text-muted">
                Edit, pin, delete, or publish articles in the News section (including articles written by the 6-hour editorial bot).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  className="input w-60 pl-9 text-xs"
                  placeholder="Search articles…"
                  value={newsSearch}
                  onChange={(e) => setNewsSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-primary py-2 text-xs"
                onClick={() => setCreatingNews(!creatingNews)}
              >
                <Plus className="h-4 w-4" /> New Article
              </button>
              <button type="button" className="btn-ghost py-2 text-xs" onClick={() => runBot("news-feeds")}>
                Run 6h News Bot Now
              </button>
            </div>
          </div>

          {/* Create New Article Card */}
          {creatingNews && (
            <form onSubmit={createNewsArticle} className="card space-y-3 border-volt/40 p-5">
              <h3 className="text-base font-bold text-white">Publish New Article</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  className="input text-xs sm:col-span-2"
                  placeholder="Article Title *"
                  value={newArticle.title}
                  onChange={(e) => setNewArticle({ ...newArticle, title: e.target.value })}
                />
                <select
                  className="input text-xs"
                  value={newArticle.category}
                  onChange={(e) => setNewArticle({ ...newArticle, category: e.target.value })}
                >
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <input
                className="input text-xs"
                placeholder="Hero Image URL (e.g. https://images.pokemontcg.io/sv8pt5/161_hires.png)"
                value={newArticle.imageUrl}
                onChange={(e) => setNewArticle({ ...newArticle, imageUrl: e.target.value })}
              />
              <textarea
                rows={2}
                required
                className="input text-xs"
                placeholder="Short Summary (shown on News cards) *"
                value={newArticle.summary}
                onChange={(e) => setNewArticle({ ...newArticle, summary: e.target.value })}
              />
              <textarea
                rows={6}
                className="input font-mono text-xs"
                placeholder="Full Article Body (Markdown supported — headings ##, bullet points, tables)"
                value={newArticle.body}
                onChange={(e) => setNewArticle({ ...newArticle, body: e.target.value })}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={newArticle.pinned}
                    onChange={(e) => setNewArticle({ ...newArticle, pinned: e.target.checked })}
                  />
                  Pin to top of News page
                </label>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost text-xs" onClick={() => setCreatingNews(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary text-xs">
                    Publish Article
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Edit Article Modal */}
          {editingArticle && (
            <form onSubmit={saveEditedArticle} className="card space-y-3 border-volt p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-white">Editing: {editingArticle.title}</h3>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-white"
                  onClick={() => setEditingArticle(null)}
                >
                  Close ✕
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  className="input text-xs sm:col-span-2"
                  value={editingArticle.title}
                  onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                />
                <select
                  className="input text-xs"
                  value={editingArticle.category}
                  onChange={(e) => setEditingArticle({ ...editingArticle, category: e.target.value })}
                >
                  {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <input
                  className="input text-xs sm:col-span-2"
                  placeholder="Image URL"
                  value={editingArticle.imageUrl ?? ""}
                  onChange={(e) => setEditingArticle({ ...editingArticle, imageUrl: e.target.value })}
                />
                <input
                  className="input text-xs"
                  placeholder="Author"
                  value={editingArticle.author}
                  onChange={(e) => setEditingArticle({ ...editingArticle, author: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-muted">Summary</label>
                <textarea
                  rows={2}
                  required
                  className="input text-xs"
                  value={editingArticle.summary}
                  onChange={(e) => setEditingArticle({ ...editingArticle, summary: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-bold uppercase text-muted">
                  Full Article Body (Markdown)
                </label>
                <textarea
                  rows={10}
                  className="input font-mono text-xs"
                  value={editingArticle.body ?? ""}
                  onChange={(e) => setEditingArticle({ ...editingArticle, body: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={editingArticle.pinned}
                    onChange={(e) => setEditingArticle({ ...editingArticle, pinned: e.target.checked })}
                  />
                  Pinned Article
                </label>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost text-xs" onClick={() => setEditingArticle(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary text-xs">
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Articles List */}
          <div className="card divide-y divide-line">
            {filteredNews.map((art) => (
              <div key={art.id} className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-panel-2/40">
                <div className="flex items-start gap-3 max-w-2xl">
                  {art.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={art.imageUrl}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-lg object-cover bg-panel-2"
                    />
                  )}
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span className="rounded bg-panel-2 px-2 py-0.5 font-bold uppercase text-volt">
                        {CATEGORY_LABEL[art.category] ?? art.category}
                      </span>
                      {art.pinned && <span className="font-bold text-volt">📌 Pinned</span>}
                      <span>by {art.author}</span>
                      <span>· {timeAgo(art.publishedAt)}</span>
                    </div>
                    <Link
                      href={`/news/${art.slug}`}
                      target="_blank"
                      className="mt-1 block text-sm font-bold text-white hover:text-volt"
                    >
                      {art.title} <ExternalLink className="inline h-3 w-3" />
                    </Link>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{art.summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => togglePinNews(art)}
                    className={`btn-ghost py-1.5 text-xs ${art.pinned ? "border-volt text-volt" : ""}`}
                    title="Pin / Unpin"
                  >
                    <Pin className="h-3.5 w-3.5" /> {art.pinned ? "Pinned" : "Pin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingArticle(art)}
                    className="btn-ghost py-1.5 text-xs"
                  >
                    <Edit3 className="h-3.5 w-3.5" /> Edit
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => deleteNewsArticle(art)}
                      className="rounded-lg p-2 text-muted hover:bg-red-500/15 hover:text-red-300"
                      title="Delete Article"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 3: REGISTERED USERS MANAGEMENT
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "users" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <Users className="h-6 w-6 text-volt" /> Registered Users ({users.length})
              </h2>
              <p className="text-xs text-muted">
                Manage signed-up collectors, custom display handles, roles, reputation, plans, and email verification.
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
                          onChange={(e) => patchUser(u.id, { role: e.target.value }, `Role updated to ${e.target.value}`)}
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
                          onChange={(e) => patchUser(u.id, { plan: e.target.value }, `Plan updated to ${e.target.value}`)}
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
                                onClick={() => patchUser(u.id, { reputation: u.reputation + 10 }, `+10 rep to ${u.name}`)}
                              >
                                +10
                              </button>
                              <button
                                className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] hover:border-red-400"
                                onClick={() => patchUser(u.id, { reputation: u.reputation - 10 }, `-10 rep from ${u.name}`)}
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
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 4: VENDING MACHINES & DROP TIMERS MANAGER
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "machines" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <MapPin className="h-6 w-6 text-volt" /> Vending Machines &amp; Timers ({machines.length})
              </h2>
              <p className="text-xs text-muted">
                Override any machine&apos;s drop interval, anchor minute (:00–:59), accuracy %, stock status, or operational status.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                className="input w-72 pl-9 text-xs"
                placeholder="Search Q00810, Seattle, Fred Meyer, ZIP…"
                value={machineSearch}
                onChange={(e) => setMachineSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-line bg-panel-2/70 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-3">Machine ID</th>
                  <th className="px-3 py-3">Retailer &amp; Location</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Stock</th>
                  <th className="px-3 py-3">Interval (m)</th>
                  <th className="px-3 py-3">Drop Minute (:XX)</th>
                  <th className="px-3 py-3">Accuracy %</th>
                  <th className="px-3 py-3 text-right">Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredMachines.map((m) => {
                  const d = machineDrafts[m.id] ?? {};
                  const dirty = Object.keys(d).length > 0;
                  return (
                    <tr key={m.id} className="hover:bg-panel-2/40">
                      <td className="px-3 py-2.5 font-mono font-bold text-volt">
                        <Link href={`/machines/${m.id}`} target="_blank" className="hover:underline">
                          {m.id} ↗
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-white">{m.retailer}</div>
                        <div className="text-[11px] text-muted">
                          {m.street}, {m.city}, {m.state} {m.zip}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          className="input w-28 px-2 py-1 text-xs"
                          value={d.status ?? m.status}
                          onChange={(e) =>
                            setMachineDrafts({
                              ...machineDrafts,
                              [m.id]: { ...d, status: e.target.value as ManagedMachine["status"] },
                            })
                          }
                        >
                          <option value="active">active</option>
                          <option value="broken">broken</option>
                          <option value="removed">removed</option>
                          <option value="unverified">unverified</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          className="input w-24 px-2 py-1 text-xs"
                          value={d.stockStatus ?? m.stockStatus}
                          onChange={(e) =>
                            setMachineDrafts({
                              ...machineDrafts,
                              [m.id]: { ...d, stockStatus: e.target.value as ManagedMachine["stockStatus"] },
                            })
                          }
                        >
                          <option value="stocked">stocked</option>
                          <option value="low">low</option>
                          <option value="out">out</option>
                          <option value="unknown">unknown</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          className="input w-20 px-2 py-1 font-mono text-xs"
                          value={d.intervalMinutes ?? m.intervalMinutes ?? 60}
                          onChange={(e) =>
                            setMachineDrafts({
                              ...machineDrafts,
                              [m.id]: { ...d, intervalMinutes: Number(e.target.value) },
                            })
                          }
                        >
                          <option value={30}>30m</option>
                          <option value={60}>60m</option>
                          <option value={90}>90m</option>
                          <option value={120}>120m</option>
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={59}
                          className="input w-20 px-2 py-1 font-mono text-xs"
                          value={d.anchorMinute ?? m.anchorMinute ?? 0}
                          onChange={(e) =>
                            setMachineDrafts({
                              ...machineDrafts,
                              [m.id]: { ...d, anchorMinute: Number(e.target.value) },
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="input w-20 px-2 py-1 font-mono text-xs"
                          value={d.accuracy ?? m.accuracy ?? 90}
                          onChange={(e) =>
                            setMachineDrafts({
                              ...machineDrafts,
                              [m.id]: { ...d, accuracy: Number(e.target.value), scheduleVerified: Number(e.target.value) >= 95 },
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={!dirty}
                          onClick={() => saveMachine(m)}
                          className={`rounded px-2.5 py-1 text-xs font-bold ${
                            dirty ? "bg-volt text-slate-950" : "bg-panel-2 text-muted opacity-40"
                          }`}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 5: RETAIL DROPS, SPONSORS & COMMUNITY COMMENTS
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "retail" && (
        <div className="space-y-8">
          {/* Retail Listings */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-black text-white">
              <ShoppingCart className="h-5 w-5 text-volt" /> Retail Drops Inventory Override ({retail.length})
            </h2>
            <div className="card max-h-96 overflow-y-auto divide-y divide-line">
              {retail.map((r) => (
                <div key={r.listing.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                  <div>
                    <span className="font-bold text-white">{r.product.name}</span>{" "}
                    <span className="rounded bg-panel-2 px-2 py-0.5 font-mono uppercase text-volt">
                      {r.listing.retailer}
                    </span>
                    <div className="mt-0.5 text-muted">
                      MSRP: ${r.product.msrp ?? "—"} ·{" "}
                      <a href={r.listing.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {r.listing.url.slice(0, 65)}… ↗
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleRetailStock(r)}
                      className={`rounded-lg px-3 py-1 font-bold ${
                        r.listing.inStock
                          ? "bg-green-500/20 text-green-400 border border-green-500/40"
                          : "bg-panel-2 text-muted border border-line"
                      }`}
                    >
                      {r.listing.inStock ? "🟢 In Stock" : "⚪ Out of Stock"}
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => deleteEntity("retail", r.listing.id, r.product.name)}
                        className="rounded p-1.5 text-muted hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Sponsors Manager */}
          <section className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-3 p-4">
              <h3 className="flex items-center gap-2 font-bold text-white">
                <Store className="h-4 w-4 text-volt" /> Active &amp; Local Shop Sponsors ({sponsors.length})
              </h3>
              <div className="divide-y divide-line">
                {sponsors.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2.5 text-xs">
                    <div>
                      <p className="font-bold text-white">{s.name}</p>
                      <p className="text-muted">
                        {s.city ? `${s.city}, ${s.state} (${s.radiusMiles}mi)` : s.kind} · {s.impressions} views ·{" "}
                        {s.clicks} clicks
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSponsor(s)}
                        className={`rounded px-2 py-1 text-[10px] font-bold ${
                          s.active ? "bg-green-500/20 text-green-400" : "bg-panel-2 text-muted"
                        }`}
                      >
                        {s.active ? "Active" : "Paused"}
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => deleteEntity("sponsor", s.id, s.name)}
                          className="text-muted hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card space-y-2 p-4">
              <h3 className="font-bold text-white">Add Geo-Targeted Local Shop Sponsor</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["name", "tagline", "url", "city", "state", "radius"] as const).map((k) => (
                  <input
                    key={k}
                    className="input text-xs"
                    placeholder={k}
                    value={spForm[k]}
                    onChange={(e) => setSpForm({ ...spForm, [k]: e.target.value })}
                  />
                ))}
              </div>
              <button type="button" className="btn-primary text-xs" onClick={createSponsor}>
                Add Sponsor
              </button>
            </div>
          </section>

          {/* Community Comments Moderation */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <MessageSquare className="h-4 w-4 text-volt" /> Recent Community Comments ({comments.length})
            </h3>
            <p className="text-xs text-muted">
              Open the <b className="text-volt">Comments</b> tab above for full comment editing &amp; multi-IP flag moderation.
            </p>
          </section>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 5B: COMMUNITY COMMENTS & FLAGGED MODERATION (2+ UNIQUE IPs)
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "comments" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <MessageSquare className="h-6 w-6 text-volt" /> Comments &amp; Flagged Moderation ({comments.length})
              </h2>
              <p className="text-xs text-muted">
                Comments flagged by <b className="text-red-300">2 or more unique IPs</b> automatically alert you in the
                Admin Inbox and appear highlighted in red below.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCommentFilter("all")}
                className={`chip text-xs ${commentFilter === "all" ? "border-volt text-volt" : ""}`}
              >
                All Comments ({comments.length})
              </button>
              <button
                type="button"
                onClick={() => setCommentFilter("flagged")}
                className={`chip text-xs ${commentFilter === "flagged" ? "border-red-400 text-red-300" : ""}`}
              >
                🚩 Flagged 2+ Unique IPs ({flaggedCommentsCount})
              </button>
              <button className="btn-ghost py-1.5 text-xs" onClick={loadContent}>
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {comments
              .filter((c) => (commentFilter === "flagged" ? (c.flagCount ?? 0) >= 2 : true))
              .map((c) => {
                const flags = c.flagCount ?? 0;
                const draftBody = editingComment[c.comment.id];
                const isEditing = draftBody !== undefined;
                return (
                  <div
                    key={c.comment.id}
                    className={`card p-4 ${
                      flags >= 2
                        ? "border-red-500/60 bg-red-500/5"
                        : flags === 1
                          ? "border-amber-400/40"
                          : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <b className="text-white">{c.authorName || "Spotter"}</b>
                          {c.authorEmail && <span className="text-muted">({c.authorEmail})</span>}
                          <Link
                            href={
                              c.comment.targetType === "machine"
                                ? `/machines/${c.comment.targetId}`
                                : `/news`
                            }
                            target="_blank"
                            className="rounded bg-panel-2 px-2 py-0.5 font-mono text-[11px] font-bold text-volt hover:underline"
                          >
                            {c.comment.targetType}: {c.comment.targetId} ↗
                          </Link>
                          <span className="text-muted">· {timeAgo(c.comment.createdAt)}</span>
                          {flags >= 2 && (
                            <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-red-300 border border-red-500/40">
                              🚨 Flagged by {flags} Unique IPs
                            </span>
                          )}
                          {flags === 1 && (
                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                              🚩 1 IP Flag
                            </span>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="flex gap-2">
                            <input
                              className="input flex-1 text-xs"
                              value={draftBody}
                              onChange={(e) =>
                                setEditingComment({ ...editingComment, [c.comment.id]: e.target.value })
                              }
                            />
                            <button
                              type="button"
                              onClick={() => saveCommentBody(c.comment.id, draftBody)}
                              className="btn-primary py-1.5 text-xs"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...editingComment };
                                delete next[c.comment.id];
                                setEditingComment(next);
                              }}
                              className="btn-ghost py-1.5 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-200">{c.comment.body}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {flags > 0 && (
                          <button
                            type="button"
                            onClick={() => clearCommentFlags(c.comment.id)}
                            className="btn-ghost py-1 text-xs text-green-300"
                          >
                            Clear Flags
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setEditingComment({ ...editingComment, [c.comment.id]: c.comment.body })
                          }
                          className="btn-ghost py-1 text-xs"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Edit
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => deleteEntity("comment", c.comment.id, "comment")}
                            className="rounded-lg p-1.5 text-muted hover:bg-red-500/15 hover:text-red-300"
                            title="Delete comment"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            {comments.length === 0 && (
              <div className="card p-6 text-center text-xs text-muted">No comments posted yet.</div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 6: AUTONOMOUS WORKER BOTS & SCRAPERS
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "bots" && (
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
                <button className="btn-ghost text-xs" onClick={() => runBot("qa-auditor")}>
                  <ShieldCheck className="h-4 w-4 text-green-400" /> Run Site QA Auditor Bot
                </button>
                <button className="btn-ghost text-xs" onClick={() => runBot("news-feeds")}>
                  <Newspaper className="h-4 w-4 text-volt" /> Run 6h Editorial News Bot
                </button>
                <button className="btn-primary text-xs" onClick={() => runBot("daily")}>
                  Run All Daily Jobs
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {scrapers?.adapters.map((a) => (
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
                      onClick={() => runBot(a.name, a.name === "official-locator" ? { mode: "metros" } : {})}
                    >
                      Run Now{a.name === "official-locator" ? " (metros)" : ""}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="card mt-4 divide-y divide-line">
            {scrapers?.runs.map((r) => (
              <div key={r.id} className="p-3 text-sm">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setOpenLog(openLog === r.id ? null : r.id)}
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
                {openLog === r.id && (
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-bg p-3 text-[11px] text-slate-300">
                    {r.error ? `ERROR: ${r.error}\n` : ""}
                    {r.log}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

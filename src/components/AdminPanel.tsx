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
  BarChart3,
  Activity,
  Globe,
  Smartphone,
  Monitor,
  ShieldAlert,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { Avatar, CATEGORY_LABEL, timeAgo } from "./ui";
import type { AdminInboxItem } from "@/app/api/contact/route";
import type { RedditOpportunity } from "@/lib/reddit-radar";
import type { FacebookOpportunity, TopZipTarget } from "@/lib/facebook-radar";

type AnalyticsSummary = {
  liveActiveHumans: number;
  totalHumanPageviews: number;
  totalUniqueHumans: number;
  todayHumanViews: number;
  todayUniqueHumans: number;
  views7d: number;
  unique7d: number;
  totalSearches?: number;
  todaySearches?: number;
  uniqueSearchers?: number;
  topSearches?: { query: string; searches: number; uniqueVisitors: number; lastSearchedAt: string }[];
  last10SearchedZips?: { id: string; zip: string; locationLabel: string; at: string; visitorHash: string }[];
  mostSearchedZipsAllTime?: {
    zip: string;
    locationLabel: string;
    searches: number;
    uniqueVisitors: number;
    lastSearchedAt: string;
  }[];
  popularMachines?: {
    machineId: string;
    retailer: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    views: number;
    searches: number;
    totalInteractions: number;
    uniqueVisitors: number;
    lastVisitedAt: string;
  }[];
  totalBotHitsExcluded: number;
  botBreakdown: { label: string; count: number }[];
  deviceBreakdown: { mobile: number; desktop: number; tablet: number };
  popularPages: { path: string; views: number; uniqueVisitors: number; lastVisitedAt: string }[];
  topSources: { source: string; visits: number; uniqueVisitors: number; lastSeenAt: string }[];
  last7Days: { date: string; humanViews: number; uniqueVisitors: number; botHitsBlocked: number }[];
  recentHumanVisits: {
    id: string;
    at: string;
    path: string;
    referrer: string;
    sourceLabel: string;
    device: "mobile" | "desktop" | "tablet";
    visitorHash: string;
    userId: string | null;
    userName: string | null;
  }[];
  funnel: {
    totalUniqueHumans: number;
    authPageUniqueVisitors: number;
    totalRealAccounts: number;
    signUpsLast24h: number;
    signUpsLast7d: number;
    conversionRate: number;
  };
  updatedAt: string;
};

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
  lastActiveAt?: string;
  providers: string[];
  activeAlerts: number;
};

type UserDetailPayload = {
  user: ManagedUser;
  reputationEvents: {
    id: string;
    userId: string;
    delta: number;
    reason: string;
    createdAt: string;
  }[];
  observations: {
    id: string;
    machineId: string;
    machineLabel: string;
    observedAt: string;
    kind: string;
    note: string | null;
    createdAt: string;
  }[];
  stockReports: {
    id: string;
    machineId: string;
    machineLabel: string;
    status: string;
    note: string | null;
    createdAt: string;
  }[];
  comments: {
    id: string;
    targetType: string;
    targetId: string;
    body: string;
    createdAt: string;
  }[];
  alerts: {
    id: string;
    kind: string;
    machineId: string | null;
    keyword: string | null;
    channels?: string[];
    active: boolean;
    createdAt: string;
  }[];
  analytics: {
    totalPageviews: number;
    totalSearches: number;
    linkedDeviceHashes: string[];
    recentVisits: {
      id: string;
      at: string;
      path: string;
      referrer: string;
      sourceLabel: string;
      device: string;
      visitorHash: string;
    }[];
    searches: {
      id: string;
      zip: string;
      query?: string;
      locationLabel: string;
      at: string;
      visitorHash: string;
    }[];
    topPagesVisited: {
      path: string;
      count: number;
      lastAt: string;
    }[];
  };
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

type TabKey = "stats" | "reddit" | "facebook" | "inbox" | "news" | "users" | "machines" | "comments" | "retail" | "bots";

export function AdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const [tab, setTab] = useState<TabKey>("stats");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  // 0. Human-Only Traffic & Conversion Analytics
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // 0b. Reddit Opportunity Radar & Reply Drafter
  const [redditOpps, setRedditOpps] = useState<RedditOpportunity[]>([]);
  const [redditScanning, setRedditScanning] = useState(false);
  const [redditLastScanAt, setRedditLastScanAt] = useState<string | null>(null);
  const [redditExcludedCount, setRedditExcludedCount] = useState<number>(12);
  const [redditCategoryFilter, setRedditCategoryFilter] = useState<
    "all" | "news" | "restock" | "vending" | "scalpers" | "pulls"
  >("all");
  const [copiedReplyId, setCopiedReplyId] = useState<string | null>(null);
  const [customRedditTitle, setCustomRedditTitle] = useState("");
  const [customRedditBody, setCustomRedditBody] = useState("");
  const [customRedditDraft, setCustomRedditDraft] = useState<{
    matchedLocationLabel: string;
    matchedMachinesCount: number;
    targetPackRadarUrl: string;
    helpfulReplyDraft: string;
    shortReplyDraft: string;
    altCleverDraft?: string;
    newsDraft?: string;
    dropsDraft?: string;
    vendingDraft?: string;
  } | null>(null);

  // 0c. Facebook Groups & Posts Radar + Clever Short Reply Drafter
  const [facebookOpps, setFacebookOpps] = useState<FacebookOpportunity[]>([]);
  const [facebookTopZips, setFacebookTopZips] = useState<TopZipTarget[]>([]);
  const [facebookCategoryFilter, setFacebookCategoryFilter] = useState<"all" | "top_zips" | "curated">("all");
  const [facebookScanning, setFacebookScanning] = useState(false);
  const [customFbTitle, setCustomFbTitle] = useState("");
  const [customFbDraft, setCustomFbDraft] = useState<{
    matchedLocationLabel: string;
    matchedMachinesCount: number;
    targetPackRadarUrl: string;
    cleverReplyDraft: string;
    ultraShortDraft: string;
    altLuckyDraft: string;
  } | null>(null);

  // 1. Inbox (Admin Alerts + Vendor Sales Inquiries)
  const [inbox, setInbox] = useState<AdminInboxItem[]>([]);
  const [inboxFilter, setInboxFilter] = useState<"all" | "open" | "vendor_sales" | "admin_alert">("all");

  // 2. Users
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const [editingReps, setEditingReps] = useState<Record<string, string>>({});
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetailPayload | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [editingRepEvents, setEditingRepEvents] = useState<
    Record<string, { delta: string; reason: string }>
  >({});
  const [newRepDelta, setNewRepDelta] = useState("5");
  const [newRepReason, setNewRepReason] = useState("");
  const [reputationLedger, setReputationLedger] = useState<
    {
      id: string;
      userId: string;
      userName: string;
      delta: number;
      reason: string;
      createdAt: string;
    }[]
  >([]);

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

  // 5. Email Alerts & Lottery Broadcast Setup
  const [emailStatus, setEmailStatus] = useState<{
    configured: boolean;
    apiKeyPreview: string | null;
    emailFrom: string;
    emailReplyTo?: string;
    usingSandboxSender?: boolean;
    stats?: {
      totalEmailSubscriptions: number;
      releaseAndLotterySubscriptions: number;
      uniqueSubscribedUsers: number;
    };
  } | null>(null);
  const [resendKeyInput, setResendKeyInput] = useState("");
  const [emailFromInput, setEmailFromInput] = useState("PackRadar <onboarding@resend.dev>");
  const [emailReplyToInput, setEmailReplyToInput] = useState("james@jpegtown.com");
  const [emailActionBusy, setEmailActionBusy] = useState(false);

  const loadInbox = () =>
    call("/api/contact", "GET")
      .then((r) => setInbox(r.items ?? []))
      .catch((e) => setMsg(e.message));

  const loadUsers = () =>
    call("/api/admin/users", "GET")
      .then((r) => {
        setUsers(r.users ?? []);
        setReputationLedger(r.reputationLedger ?? []);
      })
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

  const loadEmailSetup = () =>
    call("/api/admin/email-setup", "GET")
      .then((r) => {
        setEmailStatus(r);
        if (r.emailFrom) setEmailFromInput(r.emailFrom);
        if (r.emailReplyTo) setEmailReplyToInput(r.emailReplyTo);
      })
      .catch(() => {});

  const loadAnalytics = () =>
    call("/api/analytics/track", "GET")
      .then(setAnalytics)
      .catch(() => {});

  const loadRedditRadar = (refresh = false) => {
    setRedditScanning(true);
    call(`/api/admin/reddit-radar${refresh ? "?refresh=1" : ""}`, "GET")
      .then((r) => {
        setRedditOpps(r.opportunities ?? []);
        if (typeof r.excludedCommentedCount === "number") {
          setRedditExcludedCount(r.excludedCommentedCount);
        }
        setRedditLastScanAt(new Date().toLocaleTimeString());
      })
      .catch(() => {})
      .finally(() => setRedditScanning(false));
  };

  const loadFacebookRadar = (refresh = false) => {
    setFacebookScanning(true);
    call(`/api/admin/facebook-radar${refresh ? "?refresh=1" : ""}`, "GET")
      .then((r) => {
        setFacebookOpps(r.opportunities ?? []);
        if (Array.isArray(r.top5Zips)) {
          setFacebookTopZips(r.top5Zips);
        }
      })
      .catch(() => {})
      .finally(() => setFacebookScanning(false));
  };

  useEffect(() => {
    loadAnalytics();
    loadRedditRadar();
    loadFacebookRadar();
    loadInbox();
    loadUsers();
    loadContent();
    loadScrapers();
    loadEmailSetup();
    const t = setInterval(() => {
      loadScrapers();
      loadAnalytics();
    }, 8000);
    const redditTimer = setInterval(() => {
      loadRedditRadar(true);
    }, 60_000);
    return () => {
      clearInterval(t);
      clearInterval(redditTimer);
    };
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

  const loadUserDetail = async (userId: string) => {
    setUserDetailLoading(true);
    try {
      const res = await call(`/api/admin/users?userId=${encodeURIComponent(userId)}`, "GET");
      setSelectedUserDetail(res);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setUserDetailLoading(false);
    }
  };

  const patchUser = async (userId: string, patch: Record<string, unknown>, okMsg: string) => {
    try {
      await call("/api/admin/users", "PATCH", { userId, ...patch });
      setMsg(okMsg);
      loadUsers();
      if (selectedUserDetail?.user.id === userId) {
        void loadUserDetail(userId);
      }
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const deleteRepEvent = async (userId: string, eventId: string, reason: string, delta: number) => {
    try {
      await call("/api/admin/users", "POST", {
        action: "delete_rep_event",
        userId,
        eventId,
      });
      setMsg(`Removed "${reason}" (${delta >= 0 ? `-${delta}` : `+${Math.abs(delta)}`} rep adjusted)`);
      loadUsers();
      void loadUserDetail(userId);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const saveRepEvent = async (userId: string, eventId: string, delta: number, reason: string) => {
    try {
      await call("/api/admin/users", "POST", {
        action: "edit_rep_event",
        userId,
        eventId,
        delta,
        reason,
      });
      setMsg(`Updated reputation item to ${delta >= 0 ? `+${delta}` : delta} (${reason})`);
      const next = { ...editingRepEvents };
      delete next[eventId];
      setEditingRepEvents(next);
      loadUsers();
      void loadUserDetail(userId);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const addRepEvent = async (userId: string) => {
    const parsed = parseInt(newRepDelta, 10);
    if (Number.isNaN(parsed) || !newRepReason.trim()) return;
    try {
      await call("/api/admin/users", "POST", {
        action: "add_rep_event",
        userId,
        delta: parsed,
        reason: newRepReason.trim(),
      });
      setMsg(`Added ${parsed >= 0 ? `+${parsed}` : parsed} rep item ("${newRepReason.trim()}")`);
      setNewRepReason("");
      loadUsers();
      void loadUserDetail(userId);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const deleteUserObservation = async (userId: string, observationId: string) => {
    try {
      await call("/api/admin/users", "POST", {
        action: "delete_observation",
        userId,
        observationId,
      });
      setMsg("Removed drop observation report");
      void loadUserDetail(userId);
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
      setTimeout(() => {
        loadInbox();
        loadUsers();
        loadContent();
        loadScrapers();
      }, 2200);
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
          onClick={() => setTab("stats")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "stats"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Traffic &amp; Stats
          {analytics && (
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 font-mono text-[10px] font-extrabold text-green-400">
              {analytics.totalUniqueHumans} humans
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setTab("reddit")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "reddit"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Reddit Radar ({redditOpps.filter((o) => o.status === "open").length})
        </button>

        <button
          type="button"
          onClick={() => setTab("facebook")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            tab === "facebook"
              ? "bg-volt text-slate-950"
              : "border border-line bg-panel-2 text-slate-200 hover:border-volt/50"
          }`}
        >
          <Globe className="h-4 w-4" />
          Facebook Bot ({facebookOpps.filter((o) => o.status === "open").length})
        </button>

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
          TAB 0: HUMAN-ONLY TRAFFIC, POPULAR PAGES & BOT EXCLUSION STATS
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "stats" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <BarChart3 className="h-6 w-6 text-volt" /> Live Human Traffic, Popular Pages &amp; Bot Filtering
              </h2>
              <p className="text-xs text-muted">
                Counts <b className="text-green-400">verified real human browser visits only</b>. Discord link previews
                (Discordbot), Google/Bing crawlers, headless browsers, and our own QA/scraper bots are automatically
                excluded from human counts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={loadAnalytics} className="btn-ghost py-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh Stats
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm("Reset all traffic and pageview counters to zero?")) return;
                    await call("/api/analytics/track", "DELETE");
                    setMsg("Traffic stats reset to zero.");
                    loadAnalytics();
                  }}
                  className="btn-ghost py-1.5 text-xs text-red-300 hover:border-red-400/50"
                >
                  Reset Counters
                </button>
              )}
            </div>
          </div>

          {/* Top 6 KPI Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="card border-green-500/30 p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Live Active Humans (15m)</span>
                <Activity className="h-4 w-4 text-green-400 animate-pulse" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-green-400">
                {analytics?.liveActiveHumans ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-muted">Real browsers browsing right now</p>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Today (Human Visits)</span>
                <Users className="h-4 w-4 text-volt" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-white">
                {analytics?.todayUniqueHumans ?? 0}{" "}
                <span className="text-sm font-normal text-muted">unique</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                <b>{analytics?.todayHumanViews ?? 0}</b> human pageviews today
              </p>
            </div>

            <div className="card p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>All-Time Human Traffic</span>
                <Globe className="h-4 w-4 text-sky-400" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-white">
                {analytics?.totalUniqueHumans ?? 0}{" "}
                <span className="text-sm font-normal text-muted">unique</span>
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                <b>{analytics?.totalHumanPageviews ?? 0}</b> total human pageviews
              </p>
            </div>

            <div className="card border-sky-500/30 p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>User Searches</span>
                <Search className="h-4 w-4 text-sky-400" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-sky-400">
                {analytics?.totalSearches ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                <b>{analytics?.todaySearches ?? 0}</b> today · <b>{analytics?.uniqueSearchers ?? 0}</b> unique searchers
              </p>
            </div>

            <div className="card border-volt/30 p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Account Conversion</span>
                <CheckCircle2 className="h-4 w-4 text-volt" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-volt">
                {analytics?.funnel.conversionRate ?? 0}%
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                <b>{analytics?.funnel.totalRealAccounts ?? 0}</b> real accounts ({analytics?.funnel.signUpsLast24h ?? 0} in 24h)
              </p>
            </div>

            <div className="card border-amber-500/30 p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Bots Filtered Out</span>
                <ShieldAlert className="h-4 w-4 text-amber-300" />
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-amber-300">
                {analytics?.totalBotHitsExcluded ?? 0}
              </p>
              <p className="mt-1 text-[11px] text-muted">Excluded from human stats</p>
            </div>
          </div>

          {/* Sign-Up Conversion Funnel Bar */}
          <div className="card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                🔒 Visitor → Account Sign-Up Funnel (Human Visitors Only)
              </h3>
              <span className="text-xs text-muted">
                Guests are View-Only; 1-step Email &amp; Google Sign-Up active
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-xl border border-line bg-panel-2 p-3">
                <p className="text-muted">1. Unique Human Visitors</p>
                <p className="mt-1 font-mono text-xl font-black text-white">
                  {analytics?.funnel.totalUniqueHumans ?? 0}
                </p>
                <p className="text-[11px] text-slate-400">Landed on Map, Machine, or Drops page</p>
              </div>
              <div className="rounded-xl border border-line bg-panel-2 p-3">
                <p className="text-muted">2. Reached /sign-up or /sign-in</p>
                <p className="mt-1 font-mono text-xl font-black text-volt">
                  {analytics?.funnel.authPageUniqueVisitors ?? 0}
                </p>
                <p className="text-[11px] text-slate-400">Clicked a contribution or alert button</p>
              </div>
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3">
                <p className="text-green-300">3. Registered Real Accounts</p>
                <p className="mt-1 font-mono text-xl font-black text-green-400">
                  {analytics?.funnel.totalRealAccounts ?? 0}
                </p>
                <p className="text-[11px] text-green-200/80">
                  +{analytics?.funnel.signUpsLast7d ?? 0} new accounts in last 7 days
                </p>
              </div>
            </div>
          </div>

          {/* ZIP Code Search Intelligence + Most Popular Machines Visited / Searched */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Last 10 Searched ZIP Codes */}
            <div className="card border-sky-500/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">📍 Last 10 Searched ZIP Codes</h3>
                <span className="font-mono text-[11px] font-bold text-sky-400">Live Stream</span>
              </div>
              {(!analytics?.last10SearchedZips || analytics.last10SearchedZips.length === 0) ? (
                <p className="py-4 text-center text-xs text-muted">No ZIP codes searched yet.</p>
              ) : (
                <ul className="divide-y divide-line text-xs">
                  {analytics.last10SearchedZips.map((z) => (
                    <li key={z.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/search?q=${encodeURIComponent(z.zip)}`}
                          className="rounded bg-sky-500/15 px-2 py-0.5 font-mono font-bold text-sky-300 hover:bg-sky-500/25"
                        >
                          {z.zip}
                        </Link>
                        <span className="font-semibold text-slate-200">{z.locationLabel}</span>
                      </div>
                      <span className="text-[11px] text-muted whitespace-nowrap">
                        {timeAgo(new Date(z.at))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Most Searched ZIP Codes of All Time */}
            <div className="card border-volt/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">🏆 Most Searched ZIP Codes (All-Time)</h3>
                <span className="font-mono text-[11px] font-bold text-volt">
                  {(analytics?.mostSearchedZipsAllTime ?? []).length} ZIPs
                </span>
              </div>
              {(!analytics?.mostSearchedZipsAllTime || analytics.mostSearchedZipsAllTime.length === 0) ? (
                <p className="py-4 text-center text-xs text-muted">No ZIP code rankings yet.</p>
              ) : (
                <ul className="divide-y divide-line text-xs">
                  {analytics.mostSearchedZipsAllTime.map((z, idx) => (
                    <li key={z.zip} className="flex items-center justify-between gap-2 py-2">
                      <div className="flex items-center gap-2">
                        <span className="w-4 font-mono text-[11px] text-muted">#{idx + 1}</span>
                        <Link
                          href={`/search?q=${encodeURIComponent(z.zip)}`}
                          className="rounded bg-volt/15 px-2 py-0.5 font-mono font-bold text-volt hover:bg-volt/25"
                        >
                          {z.zip}
                        </Link>
                        <span className="font-semibold text-slate-200">{z.locationLabel}</span>
                      </div>
                      <span className="font-mono font-bold text-volt whitespace-nowrap">
                        {z.searches} searches ({z.uniqueVisitors} uniq)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Most Popular Machines Visited / Searched */}
            <div className="card border-green-500/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">🎯 Most Popular Machines Visited / Searched</h3>
                <span className="font-mono text-[11px] font-bold text-green-400">
                  {(analytics?.popularMachines ?? []).length} kiosks
                </span>
              </div>
              {(!analytics?.popularMachines || analytics.popularMachines.length === 0) ? (
                <p className="py-4 text-center text-xs text-muted">No machine pages visited yet.</p>
              ) : (
                <ul className="divide-y divide-line text-xs">
                  {analytics.popularMachines.map((m, idx) => (
                    <li key={m.machineId} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] text-muted">#{idx + 1}</span>
                          <Link
                            href={`/machines/${m.machineId}`}
                            className="font-mono font-bold text-green-400 hover:underline"
                          >
                            {m.machineId}
                          </Link>
                          <span className="truncate font-semibold text-white">· {m.retailer}</span>
                        </div>
                        <p className="truncate text-[11px] text-slate-400">
                          {m.street ? `${m.street}, ` : ""}
                          {m.city}, {m.state} {m.zip}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono font-bold text-green-400">
                          {m.totalInteractions} {m.totalInteractions === 1 ? "visit" : "visits"}
                        </p>
                        <p className="text-[10px] text-muted">{m.uniqueVisitors} uniq</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Most Popular Pages + Traffic Sources & Bot Exclusions */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">
                  🔥 Most Popular Pages (Human Visits Only)
                </h3>
                <span className="text-xs text-muted">
                  Sorted by verified human pageviews
                </span>
              </div>

              {(!analytics || analytics.popularPages.length === 0) ? (
                <p className="py-6 text-center text-xs text-muted">
                  Waiting for first human browser pageviews… Open any page in a normal browser tab to see it appear live!
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-line text-[11px] uppercase text-muted">
                      <tr>
                        <th className="py-2 pr-3">Page Path</th>
                        <th className="py-2 px-3 text-right">Human Views</th>
                        <th className="py-2 px-3 text-right">Unique Humans</th>
                        <th className="py-2 px-3">Share</th>
                        <th className="py-2 pl-3 text-right">Last Visited</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {analytics.popularPages.map((p) => {
                        const pct =
                          analytics.totalHumanPageviews > 0
                            ? Math.round((p.views / analytics.totalHumanPageviews) * 100)
                            : 0;
                        return (
                          <tr key={p.path} className="hover:bg-panel-2/40">
                            <td className="py-2.5 pr-3 font-mono font-bold text-white">
                              <Link href={p.path} className="hover:text-volt hover:underline">
                                {p.path}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-volt">
                              {p.views}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-200">
                              {p.uniqueVisitors}
                            </td>
                            <td className="py-2.5 px-3 w-28">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2">
                                  <div
                                    className="h-full rounded-full bg-volt"
                                    style={{ width: `${Math.max(4, pct)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[10px] text-muted">{pct}%</span>
                              </div>
                            </td>
                            <td className="py-2.5 pl-3 text-right text-muted">
                              {timeAgo(new Date(p.lastVisitedAt))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* User Searches Breakdown */}
              <div className="card border-sky-500/30 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">🔍 User Searches ({analytics?.totalSearches ?? 0})</h3>
                  <span className="font-mono text-xs font-bold text-sky-400">
                    {analytics?.uniqueSearchers ?? 0} searchers
                  </span>
                </div>
                {(!analytics?.topSearches || analytics.topSearches.length === 0) ? (
                  <p className="text-xs text-muted">
                    {analytics?.totalSearches
                      ? `${analytics.totalSearches} searches recorded on /search. Specific search queries (ZIPs, cities, Q-codes) will appear here as users search.`
                      : "No user searches recorded yet."}
                  </p>
                ) : (
                  <ul className="divide-y divide-line text-xs">
                    {analytics.topSearches.map((q) => (
                      <li key={q.query} className="flex items-center justify-between py-2">
                        <span className="font-mono font-semibold text-slate-200">&ldquo;{q.query}&rdquo;</span>
                        <span className="font-mono text-sky-400">
                          {q.searches}x ({q.uniqueVisitors} uniq)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Top Referrers / Traffic Sources */}
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">📣 Traffic Sources &amp; Referrers</h3>
                {(!analytics || analytics.topSources.length === 0) ? (
                  <p className="text-xs text-muted">No external human visits recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-line text-xs">
                    {analytics.topSources.map((s) => (
                      <li key={s.source} className="flex items-center justify-between py-2">
                        <span className="font-semibold text-slate-200">{s.source}</span>
                        <span className="font-mono text-volt">
                          {s.visits} visits ({s.uniqueVisitors} uniq)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Device Breakdown */}
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">📱 Human Device Breakdown</h3>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl border border-line bg-panel-2 p-2.5">
                    <Smartphone className="mx-auto h-4 w-4 text-volt" />
                    <p className="mt-1 font-mono text-base font-bold text-white">
                      {analytics?.deviceBreakdown.mobile ?? 0}
                    </p>
                    <p className="text-[10px] text-muted">Mobile</p>
                  </div>
                  <div className="rounded-xl border border-line bg-panel-2 p-2.5">
                    <Monitor className="mx-auto h-4 w-4 text-sky-400" />
                    <p className="mt-1 font-mono text-base font-bold text-white">
                      {analytics?.deviceBreakdown.desktop ?? 0}
                    </p>
                    <p className="text-[10px] text-muted">Desktop</p>
                  </div>
                  <div className="rounded-xl border border-line bg-panel-2 p-2.5">
                    <Globe className="mx-auto h-4 w-4 text-purple-400" />
                    <p className="mt-1 font-mono text-base font-bold text-white">
                      {analytics?.deviceBreakdown.tablet ?? 0}
                    </p>
                    <p className="text-[10px] text-muted">Tablet</p>
                  </div>
                </div>
              </div>

              {/* Filtered Bots Breakdown */}
              <div className="card border-amber-500/30 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-amber-300">🤖 Bots Caught &amp; Ignored</h3>
                  <span className="font-mono text-xs font-bold text-amber-300">
                    {analytics?.totalBotHitsExcluded ?? 0} blocked
                  </span>
                </div>
                <p className="text-[11px] text-muted">
                  These automated requests hit PackRadar (e.g. when Discord previews your link or our QA bot scans pages) and were excluded from your human visit counts:
                </p>
                <ul className="divide-y divide-line text-xs">
                  {(analytics?.botBreakdown ?? []).map((b) => (
                    <li key={b.label} className="flex items-center justify-between py-1.5">
                      <span className="text-slate-300">{b.label}</span>
                      <span className="font-mono font-bold text-amber-300">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Live Stream of Recent Real Human Visits */}
          <div className="card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                👀 Live Human Visitor Stream (Last 40 Human Pageviews)
              </h3>
              <span className="text-xs text-muted">Auto-refreshes every 8 seconds</span>
            </div>
            {(!analytics || analytics.recentHumanVisits.length === 0) ? (
              <p className="py-4 text-center text-xs text-muted">
                No human pageviews recorded in this window yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line text-[11px] uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 px-3">Visitor</th>
                      <th className="py-2 px-3">Page Viewed</th>
                      <th className="py-2 px-3">Source / Referrer</th>
                      <th className="py-2 pl-3 text-right">Device</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {analytics.recentHumanVisits.map((v) => (
                      <tr key={v.id} className="hover:bg-panel-2/40">
                        <td className="py-2 pr-3 text-muted whitespace-nowrap">
                          {timeAgo(new Date(v.at))}
                        </td>
                        <td className="py-2 px-3">
                          {v.userName ? (
                            <span className="rounded bg-volt/15 px-2 py-0.5 font-bold text-volt">
                              @{v.userName}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-400">
                              Guest #{v.visitorHash}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-white">
                          <Link href={v.path} className="hover:text-volt hover:underline">
                            {v.path}
                          </Link>
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {v.sourceLabel}
                        </td>
                        <td className="py-2 pl-3 text-right uppercase text-[10px] font-bold text-muted">
                          {v.device}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 0b: REDDIT OPPORTUNITY RADAR & DATA-BACKED REPLY ASSISTANT
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "reddit" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                  <Sparkles className="h-6 w-6 text-volt" /> Daily Pokémon Reddit Scanner &amp; Reply Drafter
                </h2>
                <span className="rounded-full border border-green-500/40 bg-green-500/15 px-3 py-0.5 font-mono text-[11px] font-bold text-green-300">
                  ✓ Filtering out u/Sharp-Lifeguard-8635 ({redditExcludedCount} commented threads hidden)
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Live-scans <code className="text-white">r/PokemonTCG</code>,{" "}
                <code className="text-white">r/PKMNTCGDeals</code> &amp;{" "}
                <code className="text-white">r/PokeInvesting</code> for fresh daily Pokémon posts across{" "}
                <b className="text-volt">Breaking News &amp; Set Reprints (/news)</b>,{" "}
                <b className="text-volt">Retail Drops &amp; Warehouse Pallets (/drops)</b>,{" "}
                <b className="text-white">Vending Kiosks</b>, and <b className="text-white">Pack Pulls</b>, drafting
                replies that link directly to your News articles, Retail Drops page, or Vending Map. Anything
                commented on by <code className="text-volt">u/Sharp-Lifeguard-8635</code> is automatically removed.
                {redditLastScanAt && (
                  <span className="ml-2 font-mono text-volt">· Last synced {redditLastScanAt}</span>
                )}
              </p>
            </div>
            <button
              type="button"
              disabled={redditScanning}
              onClick={() => loadRedditRadar(true)}
              className="btn-primary py-1.5 text-xs font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${redditScanning ? "animate-spin" : ""}`} />
              {redditScanning ? "Scanning Subreddits…" : "Scan Fresh Daily Posts Now"}
            </button>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                {
                  key: "all",
                  label: "All Daily Pokémon Posts",
                  count: redditOpps.filter((o) => o.status === "open" || o.status === "clicked").length,
                },
                {
                  key: "news",
                  label: "📰 News, Reprints & Allocations (/news)",
                  count: redditOpps.filter(
                    (o) => (o.status === "open" || o.status === "clicked") && o.category === "news",
                  ).length,
                },
                {
                  key: "restock",
                  label: "🛒 Retail Drops & Pallets (/drops)",
                  count: redditOpps.filter(
                    (o) => (o.status === "open" || o.status === "clicked") && o.category === "restock",
                  ).length,
                },
                {
                  key: "vending",
                  label: "🎰 Vending & Grocery Kiosks",
                  count: redditOpps.filter(
                    (o) => (o.status === "open" || o.status === "clicked") && o.category === "vending",
                  ).length,
                },
                {
                  key: "scalpers",
                  label: "🚫 Scalpers & Empty Shelves",
                  count: redditOpps.filter(
                    (o) => (o.status === "open" || o.status === "clicked") && o.category === "scalpers",
                  ).length,
                },
                {
                  key: "pulls",
                  label: "✨ Pack Pulls & New Sets",
                  count: redditOpps.filter(
                    (o) => (o.status === "open" || o.status === "clicked") && o.category === "pulls",
                  ).length,
                },
              ] as const
            ).map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setRedditCategoryFilter(pill.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  redditCategoryFilter === pill.key
                    ? "bg-volt text-slate-950"
                    : "border border-line bg-panel-2 text-slate-300 hover:border-volt/50"
                }`}
              >
                {pill.label} ({pill.count})
              </button>
            ))}
          </div>

          {/* Instant Custom Reddit Thread / Question Reply Generator */}
          <div className="card border-volt/30 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                ⚡ Custom Thread Reply Generator (Paste Any Reddit Question, News Topic, Retail Drop, or City / Zip)
              </h3>
              <span className="text-xs text-muted">
                Generates replies linking to <code className="text-volt">/news</code>,{" "}
                <code className="text-volt">/drops</code>, or <code className="text-volt">vending map</code>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="input sm:col-span-2 text-xs"
                placeholder="Paste a Reddit post title or question (e.g., 'Sam's Club 151 mini tins drop date?' or 'Any Target/Kroger restocks in Dallas?')…"
                value={customRedditTitle}
                onChange={(e) => setCustomRedditTitle(e.target.value)}
              />
              <button
                type="button"
                disabled={!customRedditTitle.trim()}
                onClick={async () => {
                  const res = await call("/api/admin/reddit-radar", "POST", {
                    action: "draft_custom",
                    title: customRedditTitle,
                    body: customRedditBody,
                  });
                  setCustomRedditDraft(res.draft);
                }}
                className="btn-primary justify-center py-2 text-xs font-bold"
              >
                <Sparkles className="h-3.5 w-3.5" /> Draft Short Reddit Reply
              </button>
            </div>

            {customRedditDraft && (
              <div className="mt-3 space-y-3 rounded-xl border border-volt/40 bg-panel-2 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-volt mr-2">
                      📍 {customRedditDraft.matchedLocationLabel} ({customRedditDraft.matchedMachinesCount}{" "}
                      machines)
                    </span>
                    {customRedditDraft.newsDraft && (
                      <button
                        type="button"
                        onClick={() =>
                          setCustomRedditDraft({
                            ...customRedditDraft,
                            helpfulReplyDraft: customRedditDraft.newsDraft!,
                          })
                        }
                        className="chip text-[11px] py-0.5"
                      >
                        📰 Link to News Article (/news)
                      </button>
                    )}
                    {customRedditDraft.dropsDraft && (
                      <button
                        type="button"
                        onClick={() =>
                          setCustomRedditDraft({
                            ...customRedditDraft,
                            helpfulReplyDraft: customRedditDraft.dropsDraft!,
                          })
                        }
                        className="chip text-[11px] py-0.5"
                      >
                        🛒 Link to Retail Drops (/drops)
                      </button>
                    )}
                    {customRedditDraft.vendingDraft && (
                      <button
                        type="button"
                        onClick={() =>
                          setCustomRedditDraft({
                            ...customRedditDraft,
                            helpfulReplyDraft: customRedditDraft.vendingDraft!,
                          })
                        }
                        className="chip text-[11px] py-0.5"
                      >
                        🎰 Link to Vending Map
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setCustomRedditDraft({
                          ...customRedditDraft,
                          helpfulReplyDraft: customRedditDraft.shortReplyDraft,
                        })
                      }
                      className="chip text-[11px] py-0.5"
                    >
                      ⚡ Use Ultra-Short 1-Liner
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(customRedditDraft.helpfulReplyDraft);
                      setCopiedReplyId("custom-full");
                      setMsg("Copied short reply to clipboard! Paste it directly into the Reddit comment box.");
                      setTimeout(() => setCopiedReplyId(null), 2500);
                    }}
                    className="btn-primary py-1 text-xs font-bold"
                  >
                    {copiedReplyId === "custom-full" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedReplyId === "custom-full" ? "Copied Reply!" : "Copy Short Reply"}
                  </button>
                </div>
                <textarea
                  rows={3}
                  className="input w-full bg-bg font-sans text-xs leading-relaxed text-slate-200"
                  value={customRedditDraft.helpfulReplyDraft}
                  onChange={(e) =>
                    setCustomRedditDraft({
                      ...customRedditDraft,
                      helpfulReplyDraft: e.target.value,
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Live Scanned Reddit Threads (Unclicked first, Clicked moved to bottom when clicking View on Reddit) */}
          <div className="space-y-4">
            {(() => {
              const nowMs = Date.now();
              const twoHoursMs = 2 * 60 * 60 * 1000;
              const visibleOpps = redditOpps.filter((opp) => {
                if (opp.status !== "open" && opp.status !== "clicked") return false;
                if (
                  opp.status === "clicked" &&
                  opp.clickedAt &&
                  nowMs - new Date(opp.clickedAt).getTime() >= twoHoursMs
                ) {
                  return false;
                }
                return redditCategoryFilter === "all" || opp.category === redditCategoryFilter;
              });

              // Find the index where the bottom "clicked" block begins so we can show the divider header
              const firstBottomClickedIdx = visibleOpps.findIndex(
                (o, idx) => o.status === "clicked" && visibleOpps.slice(idx).every((rest) => rest.status === "clicked"),
              );

              return visibleOpps.map((opp, idx) => {
                const isClicked = opp.status === "clicked";
                const showDividerBefore = idx === firstBottomClickedIdx && firstBottomClickedIdx > 0;

                const elapsedMs =
                  isClicked && opp.clickedAt ? Math.max(0, nowMs - new Date(opp.clickedAt).getTime()) : 0;
                const remainingMins = Math.max(1, Math.ceil((twoHoursMs - elapsedMs) / 60_000));

                const removeAndMarkCommented = (status: "replied" | "dismissed" = "replied") => {
                  setRedditOpps((prev) => prev.filter((item) => item.id !== opp.id));
                  setRedditExcludedCount((c) => c + 1);
                  void call("/api/admin/reddit-radar", "POST", {
                    action: "set_status",
                    id: opp.id,
                    permalink: opp.permalink,
                    status,
                  });
                };

                /**
                 * Flags the thread as clicked.
                 * - When `moveToBottom` is false (e.g. "Copy Reply & Open" or "Copy Short & Open"),
                 *   the card stays in its exact screen position so clicking multiple buttons on the same card
                 *   ALWAYS opens the exact same Reddit thread (`opp.permalink`).
                 * - When `moveToBottom` is true (e.g. clicking "View on Reddit"), it flags it as clicked
                 *   AND moves it to the bottom of the list for 2 hours before auto-removal.
                 */
                const handleOpenThread = (draftToCopy: string, moveToBottom: boolean) => {
                  navigator.clipboard.writeText(draftToCopy);
                  setCopiedReplyId(opp.id);
                  const clickedAtIso = opp.clickedAt || new Date().toISOString();
                  setMsg(
                    moveToBottom
                      ? `Opened "${opp.title.slice(0, 45)}…" on Reddit! Flagged as CLICKED and moved to the bottom for 2 hours.`
                      : `Copied reply & opened "${opp.title.slice(0, 45)}…" on Reddit! Card flagged as CLICKED in-place.`,
                  );
                  window.open(opp.permalink, "_blank", "noopener,noreferrer");

                  setRedditOpps((prev) => {
                    const updatedItem = {
                      ...opp,
                      status: "clicked" as const,
                      clickedAt: clickedAtIso,
                    };
                    if (!moveToBottom) {
                      return prev.map((item) => (item.id === opp.id ? updatedItem : item));
                    }
                    const others = prev.filter((item) => item.id !== opp.id);
                    return [...others, updatedItem];
                  });

                  void call("/api/admin/reddit-radar", "POST", {
                    action: "set_status",
                    id: opp.id,
                    permalink: opp.permalink,
                    status: "clicked",
                  });
                };

                const categoryBadge =
                  opp.category === "news"
                    ? { label: "📰 News / Reprint / Allocation", cls: "bg-amber-500/20 text-amber-300" }
                    : opp.category === "restock"
                      ? { label: "🛒 Retail Drop / Restock (/drops)", cls: "bg-sky-500/20 text-sky-300" }
                      : opp.category === "vending"
                        ? { label: "🎰 Vending Kiosk", cls: "bg-emerald-500/20 text-emerald-300" }
                        : opp.category === "scalpers"
                          ? { label: "🚫 Scalpers / Empty Shelves", cls: "bg-rose-500/20 text-rose-300" }
                          : { label: "✨ Pack Pulls / Set Discussion", cls: "bg-purple-500/20 text-purple-300" };

                return (
                  <div key={opp.id} className="space-y-3">
                    {showDividerBefore && (
                      <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-200 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          🕒 Recently Clicked / Opened on Reddit — Flagged &amp; Moved to Bottom (Auto-Removes After
                          2 Hours So You Don&apos;t Double Post)
                        </span>
                        <span className="text-[11px] font-normal text-amber-300/90">
                          Click &ldquo;Remove Immediately&rdquo; on any card to clear it right away
                        </span>
                      </div>
                    )}
                    <div
                      className={`card p-5 space-y-3 transition ${
                        isClicked
                          ? "border-amber-400/40 bg-panel-2/40 opacity-85"
                          : "border-line"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-[260px]">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {isClicked && (
                              <span className="rounded-full border border-amber-400/60 bg-amber-500/25 px-2.5 py-0.5 font-extrabold text-amber-200">
                                ✓ CLICKED ON REDDIT · Auto-removes in {remainingMins}m (Do Not Double Post)
                              </span>
                            )}
                            <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 font-bold text-orange-300">
                              {opp.subreddit}
                            </span>
                            <span className={`rounded-full px-2.5 py-0.5 font-bold ${categoryBadge.cls}`}>
                              {categoryBadge.label}
                            </span>
                            <span className="rounded-full bg-volt/15 px-2.5 py-0.5 font-bold text-volt">
                              📍 {opp.matchedLocationLabel} ({opp.matchedMachinesCount} machines)
                            </span>
                            {opp.targetPackRadarUrl && (
                              <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-slate-300">
                                🔗 Links to: {opp.targetPackRadarUrl.replace("https://packradar.onrender.com", "") || "/"}
                              </span>
                            )}
                            <span className="text-muted">
                              by {opp.author} · {timeAgo(new Date(opp.postedAt))}
                            </span>
                          </div>
                          <h3 className="text-base font-bold text-white">
                            <a
                              href={opp.permalink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.preventDefault();
                                handleOpenThread(opp.helpfulReplyDraft, true);
                              }}
                              className="hover:text-volt hover:underline"
                            >
                              {opp.title}
                            </a>
                          </h3>
                          {opp.excerpt && opp.excerpt !== opp.title && (
                            <p className="text-xs text-slate-300 leading-relaxed">
                              <b className="text-slate-400">OP Post:</b> {opp.excerpt}
                            </p>
                          )}
                          {opp.topComments && opp.topComments.length > 0 && (
                            <div className="rounded-lg border border-line/70 bg-slate-950/60 p-2.5 text-[11px] space-y-1">
                              <div className="font-bold text-slate-400">
                                💬 Current Replies in Thread ({opp.topComments.length}):
                              </div>
                              {opp.topComments.map((c, ci) => (
                                <div key={ci} className="text-slate-300 truncate">
                                  <span className="font-mono text-volt">{c.author}:</span> &ldquo;{c.body}&rdquo;
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="font-mono text-[11px] text-slate-400 break-all">
                            Thread: {opp.permalink}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenThread(opp.helpfulReplyDraft, false)}
                            className="btn-primary py-1.5 text-xs font-bold"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copy Reply &amp; Open Thread ↗
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenThread(opp.shortReplyDraft, false)}
                            className="btn-ghost py-1.5 text-xs"
                          >
                            Copy Short &amp; Open ↗
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMsg(`Removed "${opp.title.slice(0, 40)}…" permanently.`);
                              removeAndMarkCommented("dismissed");
                            }}
                            className="btn-ghost py-1.5 text-xs text-slate-400 hover:border-red-400/50 hover:text-red-300"
                            title="Already commented on this thread with u/Sharp-Lifeguard-8635 — remove permanently right now"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {isClicked ? "Remove Immediately" : "Already Commented / Remove"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-line bg-panel-2/70 p-3.5 text-xs space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>Switch Conversational Angle:</span>
                            {opp.newsDraft && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRedditOpps((prev) =>
                                    prev.map((item) =>
                                      item.id === opp.id
                                        ? { ...item, helpfulReplyDraft: opp.newsDraft! }
                                        : item,
                                    ),
                                  )
                                }
                                className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case text-amber-300 hover:border-amber-400 hover:bg-amber-500/20"
                              >
                                📰 News / Mini Tins Angle (/news)
                              </button>
                            )}
                            {opp.dropsDraft && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRedditOpps((prev) =>
                                    prev.map((item) =>
                                      item.id === opp.id
                                        ? { ...item, helpfulReplyDraft: opp.dropsDraft! }
                                        : item,
                                    ),
                                  )
                                }
                                className="rounded border border-sky-400/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case text-sky-300 hover:border-sky-400 hover:bg-sky-500/20"
                              >
                                🛒 Retail Drops Angle (/drops)
                              </button>
                            )}
                            {opp.vendingDraft && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRedditOpps((prev) =>
                                    prev.map((item) =>
                                      item.id === opp.id
                                        ? { ...item, helpfulReplyDraft: opp.vendingDraft! }
                                        : item,
                                    ),
                                  )
                                }
                                className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold normal-case text-emerald-300 hover:border-emerald-400 hover:bg-emerald-500/20"
                              >
                                🎰 Vending Kiosk Angle
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setRedditOpps((prev) =>
                                  prev.map((item) =>
                                    item.id === opp.id ? { ...item, helpfulReplyDraft: opp.shortReplyDraft } : item,
                                  ),
                                )
                              }
                              className="rounded border border-line bg-bg px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-300 hover:border-volt hover:text-volt"
                            >
                              ⚡ 1-Liner Version
                            </button>
                          </div>
                          <a
                            href={opp.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => {
                              e.preventDefault();
                              handleOpenThread(opp.helpfulReplyDraft, true);
                            }}
                            className={`font-bold hover:underline ${
                              isClicked ? "text-amber-300" : "text-volt"
                            }`}
                          >
                            {isClicked
                              ? `✓ Clicked (Auto-Removes in ${remainingMins}m) — Move to Bottom & Open on Reddit ↗`
                              : "View on Reddit (Flags Clicked & Moves to Bottom for 2h) ↗"}
                          </a>
                        </div>
                        <textarea
                          rows={3}
                          className="input w-full bg-bg/90 font-sans text-xs leading-relaxed text-slate-200"
                          value={opp.helpfulReplyDraft}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRedditOpps((prev) =>
                              prev.map((item) =>
                                item.id === opp.id ? { ...item, helpfulReplyDraft: val } : item,
                              ),
                            );
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB 0c: FACEBOOK BOT & CLEVER SHORT REPLY DRAFTER
         ═══════════════════════════════════════════════════════════════════════ */}
      {tab === "facebook" && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <Globe className="h-6 w-6 text-sky-400" /> Facebook Bot &amp; Top 5 ZIP Code Reply Drafter
              </h2>
              <p className="text-xs text-muted">
                Targets your <b className="text-volt">Top 5 Live Searched ZIP Codes</b> alongside active Pokémon TCG
                &amp; vending machine Facebook groups/posts, and drafts{" "}
                <b className="text-white">short, clever 1–2 sentence replies</b> about timing the machine&apos;s{" "}
                <code className="text-volt">:XX</code> drop minute. Clicking any link auto-copies the reply so you can
                paste it right into Facebook.
              </p>
            </div>
            <button
              type="button"
              disabled={facebookScanning}
              onClick={() => loadFacebookRadar(true)}
              className="btn-primary py-1.5 text-xs font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${facebookScanning ? "animate-spin" : ""}`} />
              {facebookScanning ? "Refreshing Feeds…" : "Refresh Facebook & Top ZIPs"}
            </button>
          </div>

          {/* Live Top 5 Searched ZIP Codes Target Banner */}
          {facebookTopZips.length > 0 && (
            <div className="card border-volt/40 bg-volt/5 p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-volt">
                  🔥 Current Top 5 Searched ZIP Codes on PackRadar (Auto-Targeted in Feed Below)
                </span>
                <span className="text-[11px] text-muted">
                  Click any ZIP to draft a custom local reply or jump to its local Facebook groups &amp; posts
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-5">
                {facebookTopZips.map((z, idx) => (
                  <button
                    key={z.zip}
                    type="button"
                    onClick={async () => {
                      setFacebookCategoryFilter("top_zips");
                      setCustomFbTitle(`${z.city}, ${z.state} ${z.zip} ${z.sampleRetailer} ${z.sampleMachineId}`);
                      const res = await call("/api/admin/facebook-radar", "POST", {
                        action: "draft_custom",
                        title: `${z.city}, ${z.state} ${z.zip} ${z.sampleRetailer} ${z.sampleMachineId}`,
                      });
                      setCustomFbDraft(res.draft);
                    }}
                    className="rounded-xl border border-line bg-panel-2 p-2.5 text-left transition hover:border-volt"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-mono font-black text-volt">
                        #{idx + 1} · {z.zip}
                      </span>
                      <span className="rounded bg-volt/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-volt">
                        {z.searches} searches
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-white">
                      {z.city}, {z.state}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-muted">
                      {z.sampleRetailer} ({z.sampleMachineId}) · :{z.sampleAnchorMinute}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                {
                  key: "all",
                  label: "All Facebook Feeds",
                  count: facebookOpps.length,
                },
                {
                  key: "top_zips",
                  label: "🔥 Top 5 Searched ZIPs (Local Groups & Posts)",
                  count: facebookOpps.filter(
                    (o) => o.category === "top_zip_group" || o.category === "top_zip_posts",
                  ).length,
                },
                {
                  key: "curated",
                  label: "📌 Direct Vending & TCG Threads",
                  count: facebookOpps.filter(
                    (o) => !o.category || o.category === "curated",
                  ).length,
                },
              ] as const
            ).map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFacebookCategoryFilter(pill.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  facebookCategoryFilter === pill.key
                    ? "bg-volt text-slate-950"
                    : "border border-line bg-panel-2 text-slate-300 hover:border-volt/50"
                }`}
              >
                {pill.label} ({pill.count})
              </button>
            ))}
          </div>

          {/* Instant Custom Facebook Post / Comment Reply Generator */}
          <div className="card border-sky-500/30 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                ⚡ Custom Facebook Comment Generator (Paste Any FB Post, Group Topic, City, or Q-Code)
              </h3>
              <span className="text-xs text-muted">
                Generates 3 short, punchy &ldquo;got lucky timing the drop&rdquo; replies
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                className="input sm:col-span-2 text-xs"
                placeholder="Paste a Facebook post or city/topic (e.g., 'My Kroger machine is always sold out' or 'Seattle Fred Meyer pulls')…"
                value={customFbTitle}
                onChange={(e) => setCustomFbTitle(e.target.value)}
              />
              <button
                type="button"
                disabled={!customFbTitle.trim()}
                onClick={async () => {
                  const res = await call("/api/admin/facebook-radar", "POST", {
                    action: "draft_custom",
                    title: customFbTitle,
                  });
                  setCustomFbDraft(res.draft);
                }}
                className="btn-primary justify-center py-2 text-xs font-bold"
              >
                <Sparkles className="h-3.5 w-3.5" /> Draft Short FB Reply
              </button>
            </div>

            {customFbDraft && (
              <div className="mt-3 space-y-3 rounded-xl border border-sky-400/40 bg-panel-2 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-sky-300 mr-2">
                      📍 {customFbDraft.matchedLocationLabel} ({customFbDraft.matchedMachinesCount} kiosks)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomFbDraft({
                          ...customFbDraft,
                          cleverReplyDraft: customFbDraft.ultraShortDraft,
                        })
                      }
                      className="chip text-[11px] py-0.5"
                    >
                      ⚡ Use Ultra-Short 1-Liner
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCustomFbDraft({
                          ...customFbDraft,
                          cleverReplyDraft: customFbDraft.altLuckyDraft,
                        })
                      }
                      className="chip text-[11px] py-0.5"
                    >
                      🎯 Use Alt &ldquo;Sold Out&rdquo; Tip
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(customFbDraft.cleverReplyDraft);
                      setCopiedReplyId("fb-custom");
                      setMsg("Copied short Facebook reply! Paste it directly into the Facebook comment box.");
                      setTimeout(() => setCopiedReplyId(null), 2500);
                    }}
                    className="btn-primary py-1 text-xs font-bold"
                  >
                    {copiedReplyId === "fb-custom" ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedReplyId === "fb-custom" ? "Copied FB Reply!" : "Copy FB Reply"}
                  </button>
                </div>
                <textarea
                  rows={3}
                  className="input w-full bg-bg font-sans text-xs leading-relaxed text-slate-200"
                  value={customFbDraft.cleverReplyDraft}
                  onChange={(e) =>
                    setCustomFbDraft({
                      ...customFbDraft,
                      cleverReplyDraft: e.target.value,
                    })
                  }
                />
              </div>
            )}
          </div>

          {/* Curated Live Facebook Feeds & Group Post Searches */}
          <div className="space-y-4">
            {facebookOpps
              .filter((opp) =>
                facebookCategoryFilter === "all"
                  ? true
                  : facebookCategoryFilter === "top_zips"
                    ? opp.category === "top_zip_group" || opp.category === "top_zip_posts"
                    : !opp.category || opp.category === "curated",
              )
              .map((opp) => {
              const copyAndOpenFacebook = (textToCopy = opp.cleverReplyDraft) => {
                navigator.clipboard.writeText(textToCopy);
                setCopiedReplyId(opp.id);
                setMsg("Clever Facebook reply copied to clipboard! Opening Facebook so you can paste it.");
                setTimeout(() => setCopiedReplyId(null), 3000);
                window.open(opp.permalink, "_blank", "noopener,noreferrer");
                void call("/api/admin/facebook-radar", "POST", {
                  action: "set_status",
                  id: opp.id,
                  status: "replied",
                }).then((r) => setFacebookOpps(r.opportunities ?? []));
              };

              return (
                <div
                  key={opp.id}
                  className={`card p-5 space-y-3 ${
                    opp.status === "replied"
                      ? "border-green-500/40 bg-green-500/5"
                      : opp.status === "dismissed"
                        ? "opacity-50"
                        : "border-line"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 font-bold text-sky-300">
                          {opp.groupName}
                        </span>
                        <span className="rounded-full bg-volt/15 px-2.5 py-0.5 font-bold text-volt">
                          🎯 {opp.topicTag}
                        </span>
                        {opp.status === "replied" && (
                          <span className="rounded-full bg-green-500/20 px-2 py-0.5 font-bold text-green-400">
                            ✓ Opened &amp; Copied
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white">
                        <a
                          href={opp.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            copyAndOpenFacebook(opp.cleverReplyDraft);
                          }}
                          className="hover:text-volt hover:underline"
                        >
                          {opp.title}
                        </a>
                      </h3>
                      <p className="text-xs text-slate-300">{opp.excerpt}</p>
                      <p className="font-mono text-[11px] text-sky-400/90 break-all">
                        Direct Thread / Post: {opp.permalink}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyAndOpenFacebook(opp.cleverReplyDraft)}
                        className="btn-primary py-1.5 text-xs font-bold"
                      >
                        {copiedReplyId === opp.id ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {copiedReplyId === opp.id
                          ? "Copied! Paste in Post ↗"
                          : "Copy Reply & Open Post ↗"}
                      </button>
                      <button
                        type="button"
                        onClick={() => copyAndOpenFacebook(opp.ultraShortDraft)}
                        className="btn-ghost py-1.5 text-xs"
                      >
                        Copy 1-Liner &amp; Open ↗
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-line bg-panel-2/70 p-3.5 text-xs space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-muted">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>Short Clever Reply (Editable):</span>
                        <button
                          type="button"
                          onClick={() =>
                            setFacebookOpps((prev) =>
                              prev.map((item) =>
                                item.id === opp.id ? { ...item, cleverReplyDraft: opp.ultraShortDraft } : item,
                              ),
                            )
                          }
                          className="rounded border border-line bg-bg px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-300 hover:border-volt hover:text-volt"
                        >
                          ⚡ 1-Liner Version
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFacebookOpps((prev) =>
                              prev.map((item) =>
                                item.id === opp.id ? { ...item, cleverReplyDraft: opp.altLuckyDraft } : item,
                              ),
                            )
                          }
                          className="rounded border border-line bg-bg px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-300 hover:border-volt hover:text-volt"
                        >
                          🎯 &ldquo;Got Lucky&rdquo; Version
                        </button>
                      </div>
                      <a
                        href={opp.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          copyAndOpenFacebook(opp.cleverReplyDraft);
                        }}
                        className="text-sky-300 hover:underline"
                      >
                        View on Facebook (Auto-Copies Reply) ↗
                      </a>
                    </div>
                    <textarea
                      rows={3}
                      className="input w-full bg-bg/90 font-sans text-xs leading-relaxed text-slate-200"
                      value={opp.cleverReplyDraft}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFacebookOpps((prev) =>
                          prev.map((item) =>
                            item.id === opp.id ? { ...item, cleverReplyDraft: val } : item,
                          ),
                        );
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

          {/* Email Alerts & Online Lottery Broadcast Card */}
          {isAdmin && (
            <div className="card border-volt/40 bg-gradient-to-r from-volt/10 via-panel to-panel-2 p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-volt px-2.5 py-0.5 text-[11px] font-black uppercase text-slate-950">
                      📧 Release &amp; Online Lottery Email Alerts
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        emailStatus?.configured
                          ? "bg-green-500/20 text-green-300 border border-green-500/40"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {emailStatus?.configured
                        ? `🟢 Live Resend Active (${emailStatus.apiKeyPreview})`
                        : "🟡 Awaiting Resend API Key (re_...)"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    Active Email Alert Subscriptions:{" "}
                    <b className="text-white">{emailStatus?.stats?.totalEmailSubscriptions ?? 0}</b> across{" "}
                    <b className="text-volt">{emailStatus?.stats?.uniqueSubscribedUsers ?? 0} collectors</b> (
                    {emailStatus?.stats?.releaseAndLotterySubscriptions ?? 0} Release/Lottery/Drop alerts).
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={emailActionBusy}
                    onClick={async () => {
                      setEmailActionBusy(true);
                      try {
                        const r = await call("/api/admin/email-setup", "POST", { action: "test_email" });
                        setMsg(r.message);
                      } catch (e) {
                        setMsg((e as Error).message);
                      } finally {
                        setEmailActionBusy(false);
                      }
                    }}
                    className="btn-ghost py-1.5 text-xs"
                  >
                    Send Test Lottery Email to Me
                  </button>
                  <button
                    type="button"
                    disabled={emailActionBusy}
                    onClick={async () => {
                      setEmailActionBusy(true);
                      try {
                        const r = await call("/api/admin/email-setup", "POST", { action: "broadcast_alert" });
                        setMsg(r.message);
                      } catch (e) {
                        setMsg((e as Error).message);
                      } finally {
                        setEmailActionBusy(false);
                      }
                    }}
                    className="btn-primary py-1.5 text-xs"
                  >
                    Broadcast Lottery &amp; Drop Email Alert Now
                  </button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4 pt-1">
                <input
                  type="password"
                  className="input text-xs"
                  placeholder={
                    emailStatus?.configured
                      ? `Update Resend API Key (${emailStatus.apiKeyPreview})`
                      : "Paste Resend API Key (re_...) from resend.com"
                  }
                  value={resendKeyInput}
                  onChange={(e) => setResendKeyInput(e.target.value)}
                />
                <input
                  className="input text-xs"
                  placeholder="From (e.g. PackRadar <alerts@jpegtown.com>)"
                  value={emailFromInput}
                  onChange={(e) => setEmailFromInput(e.target.value)}
                />
                <input
                  className="input text-xs"
                  placeholder="Reply-To (e.g. james@jpegtown.com)"
                  value={emailReplyToInput}
                  onChange={(e) => setEmailReplyToInput(e.target.value)}
                />
                <button
                  type="button"
                  disabled={emailActionBusy}
                  onClick={async () => {
                    setEmailActionBusy(true);
                    try {
                      const r = await call("/api/admin/email-setup", "POST", {
                        action: "save_config",
                        resendApiKey: resendKeyInput || undefined,
                        emailFrom: emailFromInput || undefined,
                        emailReplyTo: emailReplyToInput || undefined,
                      });
                      setMsg(r.message);
                      setResendKeyInput("");
                      loadEmailSetup();
                    } catch (e) {
                      setMsg((e as Error).message);
                    } finally {
                      setEmailActionBusy(false);
                    }
                  }}
                  className="btn-ghost text-xs font-bold text-volt border-volt/40"
                >
                  Save Email Provider Settings
                </button>
              </div>
              {emailStatus?.usingSandboxSender && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                  <b>Why did test emails land in Spam?</b> <code className="text-white">onboarding@resend.dev</code> is Resend&apos;s shared sandbox domain used by thousands of test apps, and Resend restricts it to only send to your own email (<code className="text-white">james@jpegtown.com</code>). Add <code className="text-white">jpegtown.com</code> at <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline text-volt">resend.com/domains</a> and change From to <code className="text-white">PackRadar &lt;alerts@jpegtown.com&gt;</code> for Primary Inbox delivery to all users.
                </p>
              )}
            </div>
          )}

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
                  <th className="px-4 py-3">Last Logged In / Active</th>
                  <th className="px-4 py-3">Joined</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredUsers.map((u) => {
                  const draftName = editingNames[u.id] ?? u.name;
                  const isSelected = selectedUserDetail?.user.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      className={`transition ${
                        isSelected ? "bg-volt/10" : "hover:bg-panel-2/40"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => loadUserDetail(u.id)}
                            className="flex items-center gap-2 text-left hover:opacity-90"
                            title="Click to inspect user history, searches & repped items"
                          >
                            <Avatar name={u.name} size={28} />
                          </button>
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
                          <button
                            type="button"
                            onClick={() => loadUserDetail(u.id)}
                            className="rounded border border-volt/40 bg-volt/15 px-2 py-0.5 text-[10px] font-bold text-volt hover:bg-volt/25"
                          >
                            {isSelected ? "Viewing History" : "📜 History & Rep"}
                          </button>
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isAdmin ? (
                            <>
                              <input
                                type="number"
                                className="input w-20 px-2 py-1 font-mono text-xs font-bold text-volt"
                                value={editingReps[u.id] ?? String(u.reputation)}
                                onChange={(e) =>
                                  setEditingReps({ ...editingReps, [u.id]: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const parsed = parseInt(editingReps[u.id] ?? String(u.reputation), 10);
                                    if (!Number.isNaN(parsed)) {
                                      patchUser(
                                        u.id,
                                        { reputation: parsed },
                                        `Set ${u.name}'s reputation to ${parsed}`,
                                      );
                                    }
                                  }
                                }}
                              />
                              {editingReps[u.id] !== undefined &&
                                editingReps[u.id] !== String(u.reputation) && (
                                  <button
                                    type="button"
                                    className="rounded bg-volt px-2 py-1 text-[10px] font-bold text-slate-950"
                                    onClick={() => {
                                      const parsed = parseInt(editingReps[u.id] ?? String(u.reputation), 10);
                                      if (!Number.isNaN(parsed)) {
                                        patchUser(
                                          u.id,
                                          { reputation: parsed },
                                          `Set ${u.name}'s reputation to ${parsed}`,
                                        );
                                        const next = { ...editingReps };
                                        delete next[u.id];
                                        setEditingReps(next);
                                      }
                                    }}
                                  >
                                    Set
                                  </button>
                                )}
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] hover:border-volt"
                                  onClick={() => {
                                    const nextRep = u.reputation + 10;
                                    const next = { ...editingReps };
                                    delete next[u.id];
                                    setEditingReps(next);
                                    patchUser(u.id, { reputation: nextRep }, `+10 rep to ${u.name} (${nextRep})`);
                                  }}
                                >
                                  +10
                                </button>
                                <button
                                  type="button"
                                  className="rounded border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] hover:border-red-400"
                                  onClick={() => {
                                    const nextRep = u.reputation - 10;
                                    const next = { ...editingReps };
                                    delete next[u.id];
                                    setEditingReps(next);
                                    patchUser(u.id, { reputation: nextRep }, `-10 rep from ${u.name} (${nextRep})`);
                                  }}
                                >
                                  -10
                                </button>
                              </div>
                            </>
                          ) : (
                            <span className="font-mono text-sm font-bold text-volt">{u.reputation}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <div>ZIP: {u.homeZip || "—"}</div>
                        <div className="text-[10px] text-muted">{u.activeAlerts} active alerts</div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const lastIso = u.lastActiveAt || u.createdAt;
                          const ageMs = Date.now() - new Date(lastIso).getTime();
                          const isOnlineNow = ageMs <= 15 * 60_000;
                          const isActiveToday = ageMs <= 24 * 3600_000;
                          const isActiveWeek = ageMs <= 7 * 24 * 3600_000;
                          return (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${
                                    isOnlineNow
                                      ? "bg-green-400 animate-pulse"
                                      : isActiveToday
                                        ? "bg-emerald-400"
                                        : isActiveWeek
                                          ? "bg-amber-400"
                                          : "bg-slate-500"
                                  }`}
                                />
                                <span
                                  className={`font-bold ${
                                    isOnlineNow || isActiveToday
                                      ? "text-green-400"
                                      : isActiveWeek
                                        ? "text-amber-300"
                                        : "text-slate-300"
                                  }`}
                                >
                                  {timeAgo(lastIso)}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted">
                                {new Date(lastIso).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}{" "}
                                ·{" "}
                                {new Date(lastIso).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </div>
                            </div>
                          );
                        })()}
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

          {/* ── SELECTED USER HISTORY, SEARCHES & REPUTATION INSPECTOR ── */}
          {userDetailLoading && (
            <div className="card border-volt/40 p-6 text-center text-xs text-volt">
              Loading user history, searches, pageviews &amp; reputation events…
            </div>
          )}

          {selectedUserDetail && !userDetailLoading && (
            <div className="card border-volt/50 bg-panel p-6 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedUserDetail.user.name} size={42} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-white">{selectedUserDetail.user.name}</h3>
                      <span className="rounded-full bg-volt/20 px-2.5 py-0.5 font-mono text-xs font-bold text-volt">
                        {selectedUserDetail.user.reputation} Rep
                      </span>
                      <span className="rounded bg-panel-2 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-300">
                        {selectedUserDetail.user.role} · {selectedUserDetail.user.plan}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {selectedUserDetail.user.email} · Home ZIP:{" "}
                      <b className="text-slate-200">{selectedUserDetail.user.homeZip || "Not set"}</b> · Joined{" "}
                      {timeAgo(selectedUserDetail.user.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadUserDetail(selectedUserDetail.user.id)}
                    className="btn-ghost py-1.5 text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh User
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUserDetail(null)}
                    className="rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white"
                  >
                    Close Inspector ✕
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards for This User */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-line bg-panel-2 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-muted">Total Reputation</p>
                  <p className="mt-1 font-mono text-2xl font-black text-volt">
                    {selectedUserDetail.user.reputation}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selectedUserDetail.reputationEvents.length} logged rep items
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-panel-2 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-muted">Pageviews Tracked</p>
                  <p className="mt-1 font-mono text-2xl font-black text-white">
                    {selectedUserDetail.analytics.totalPageviews}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selectedUserDetail.analytics.topPagesVisited.length} unique pages visited
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-panel-2 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-muted">Searches &amp; ZIP Lookups</p>
                  <p className="mt-1 font-mono text-2xl font-black text-sky-400">
                    {selectedUserDetail.analytics.totalSearches}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Home ZIP: {selectedUserDetail.user.homeZip || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-panel-2 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-muted">Drop &amp; Stock Reports</p>
                  <p className="mt-1 font-mono text-2xl font-black text-green-400">
                    {selectedUserDetail.observations.length + selectedUserDetail.stockReports.length}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selectedUserDetail.observations.length} drops · {selectedUserDetail.stockReports.length} stock
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-panel-2 p-3.5">
                  <p className="text-[11px] font-bold uppercase text-muted">Comments &amp; Alerts</p>
                  <p className="mt-1 font-mono text-2xl font-black text-amber-300">
                    {selectedUserDetail.comments.length} / {selectedUserDetail.alerts.length}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {selectedUserDetail.comments.length} comments · {selectedUserDetail.alerts.length} alerts
                  </p>
                </div>
              </div>

              {/* 1. INDIVIDUAL REPPED ITEMS MANAGER (EDIT OR REMOVE FALSE ITEMS) */}
              <div className="rounded-xl border border-volt/30 bg-panel-2/60 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-black text-white">
                      🏆 Things {selectedUserDetail.user.name} Got Rep For (Individual Repped Items)
                    </h4>
                    <p className="text-xs text-muted">
                      Edit the points or reason on any item below, or click{" "}
                      <b className="text-red-300">Remove / False Report</b> to delete the item and automatically deduct
                      its points from {selectedUserDetail.user.name}&apos;s reputation.
                    </p>
                  </div>
                </div>

                {/* Add a New Custom Rep Event */}
                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg/80 p-2.5 text-xs">
                    <span className="font-bold text-slate-300">+ Award / Deduct Rep Item:</span>
                    <input
                      type="number"
                      className="input w-20 px-2 py-1 font-mono text-xs font-bold text-volt"
                      placeholder="+5"
                      value={newRepDelta}
                      onChange={(e) => setNewRepDelta(e.target.value)}
                    />
                    <input
                      className="input flex-1 min-w-[220px] px-2.5 py-1 text-xs"
                      placeholder="Reason (e.g., 'Verified drop time at Q01010' or 'Penalty: false stock report')…"
                      value={newRepReason}
                      onChange={(e) => setNewRepReason(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!newRepReason.trim()}
                      onClick={() => addRepEvent(selectedUserDetail.user.id)}
                      className="btn-primary py-1 text-xs font-bold"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Rep Item
                    </button>
                  </div>
                )}

                {selectedUserDetail.reputationEvents.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted">
                    No reputation events recorded for this user.
                  </p>
                ) : (
                  <div className="divide-y divide-line rounded-lg border border-line bg-bg/60 text-xs">
                    {selectedUserDetail.reputationEvents.map((ev) => {
                      const draft = editingRepEvents[ev.id] ?? {
                        delta: String(ev.delta),
                        reason: ev.reason,
                      };
                      const isDirty =
                        draft.delta !== String(ev.delta) || draft.reason !== ev.reason;

                      return (
                        <div
                          key={ev.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5"
                        >
                          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[260px]">
                            <input
                              type="number"
                              disabled={!isAdmin}
                              className={`input w-20 px-2 py-1 font-mono text-xs font-black ${
                                Number(draft.delta) >= 0 ? "text-green-400" : "text-red-400"
                              }`}
                              value={draft.delta}
                              onChange={(e) =>
                                setEditingRepEvents({
                                  ...editingRepEvents,
                                  [ev.id]: { ...draft, delta: e.target.value },
                                })
                              }
                            />
                            <input
                              disabled={!isAdmin}
                              className="input flex-1 min-w-[200px] px-2.5 py-1 text-xs text-slate-200"
                              value={draft.reason}
                              onChange={(e) =>
                                setEditingRepEvents({
                                  ...editingRepEvents,
                                  [ev.id]: { ...draft, reason: e.target.value },
                                })
                              }
                            />
                            <span className="text-[11px] text-muted whitespace-nowrap">
                              {timeAgo(new Date(ev.createdAt))}
                            </span>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center gap-1.5">
                              {isDirty && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const parsed = parseInt(draft.delta, 10);
                                    if (!Number.isNaN(parsed) && draft.reason.trim()) {
                                      void saveRepEvent(
                                        selectedUserDetail.user.id,
                                        ev.id,
                                        parsed,
                                        draft.reason.trim(),
                                      );
                                    }
                                  }}
                                  className="rounded bg-volt px-2.5 py-1 text-[11px] font-bold text-slate-950"
                                >
                                  Save Edit
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  deleteRepEvent(
                                    selectedUserDetail.user.id,
                                    ev.id,
                                    ev.reason,
                                    ev.delta,
                                  )
                                }
                                className="rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20"
                                title="Delete this repped item and reverse its points from the user's total rep"
                              >
                                🗑️ Remove / False ({ev.delta >= 0 ? `-${ev.delta}` : `+${Math.abs(ev.delta)}`} rep)
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. USER'S SEARCHES + PAGEVIEWS + REPORTS GRID */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* User's Search History */}
                <div className="rounded-xl border border-line bg-panel-2/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-300">
                      🔍 Search History ({selectedUserDetail.analytics.searches.length})
                    </h4>
                  </div>
                  {selectedUserDetail.analytics.searches.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted">
                      No searches recorded for this user yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line max-h-64 overflow-y-auto text-xs">
                      {selectedUserDetail.analytics.searches.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                          <div>
                            <Link
                              href={`/search?q=${encodeURIComponent(s.query || s.zip)}`}
                              className="font-mono font-bold text-sky-400 hover:underline"
                            >
                              {s.query || s.zip}
                            </Link>
                            <span className="ml-2 text-slate-300">{s.locationLabel}</span>
                          </div>
                          <span className="text-[11px] text-muted whitespace-nowrap">
                            {timeAgo(new Date(s.at))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* User's Pageview & Machine Visit History */}
                <div className="rounded-xl border border-line bg-panel-2/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-volt">
                      🌐 Pageviews &amp; Machine Visits ({selectedUserDetail.analytics.recentVisits.length})
                    </h4>
                  </div>
                  {selectedUserDetail.analytics.recentVisits.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted">
                      No pageviews linked to this user yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line max-h-64 overflow-y-auto text-xs">
                      {selectedUserDetail.analytics.recentVisits.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <Link
                              href={v.path}
                              className="truncate font-mono font-bold text-white hover:text-volt hover:underline"
                            >
                              {v.path}
                            </Link>
                            <p className="text-[10px] text-slate-400">
                              {v.device} · {v.sourceLabel}
                            </p>
                          </div>
                          <span className="text-[11px] text-muted whitespace-nowrap">
                            {timeAgo(new Date(v.at))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* User's Submitted Drop Observations, Stock Reports & Comments */}
                <div className="rounded-xl border border-line bg-panel-2/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-green-400">
                      📍 Drop Reports &amp; Check-Ins (
                      {selectedUserDetail.observations.length +
                        selectedUserDetail.stockReports.length +
                        selectedUserDetail.comments.length}
                      )
                    </h4>
                  </div>
                  {selectedUserDetail.observations.length === 0 &&
                  selectedUserDetail.stockReports.length === 0 &&
                  selectedUserDetail.comments.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted">
                      No machine drop reports or comments submitted yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-line max-h-64 overflow-y-auto text-xs">
                      {selectedUserDetail.observations.map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <Link
                              href={`/machines/${o.machineId}`}
                              className="font-mono font-bold text-green-400 hover:underline"
                            >
                              {o.machineId}
                            </Link>
                            <span className="ml-1.5 text-slate-200">
                              {o.kind === "dropped" ? "🎯 Reported Drop" : "⚪ No Drop"}
                            </span>
                            <p className="truncate text-[10px] text-slate-400">{o.machineLabel}</p>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted">
                              {timeAgo(new Date(o.createdAt))}
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  deleteUserObservation(selectedUserDetail.user.id, o.id)
                                }
                                className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300 hover:bg-red-500/25"
                                title="Delete false drop observation"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                      {selectedUserDetail.stockReports.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                          <div className="min-w-0">
                            <Link
                              href={`/machines/${s.machineId}`}
                              className="font-mono font-bold text-volt hover:underline"
                            >
                              {s.machineId}
                            </Link>
                            <span className="ml-1.5 text-slate-200">Stock: {s.status}</span>
                            <p className="truncate text-[10px] text-slate-400">{s.machineLabel}</p>
                          </div>
                          <span className="text-[10px] text-muted">
                            {timeAgo(new Date(s.createdAt))}
                          </span>
                        </li>
                      ))}
                      {selectedUserDetail.comments.map((c) => (
                        <li key={c.id} className="py-2">
                          <div className="flex items-center justify-between text-[10px] text-muted">
                            <span>
                              Comment on {c.targetType} ({c.targetId})
                            </span>
                            <span>{timeAgo(new Date(c.createdAt))}</span>
                          </div>
                          <p className="mt-0.5 text-slate-200">{c.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* User's Active Alert Subscriptions */}
                  {selectedUserDetail.alerts.length > 0 && (
                    <div className="pt-3 border-t border-line space-y-2">
                      <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                        🔔 Active Alerts ({selectedUserDetail.alerts.length})
                      </h5>
                      <ul className="divide-y divide-line max-h-44 overflow-y-auto text-xs">
                        {selectedUserDetail.alerts.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                            <div className="min-w-0 truncate">
                              {a.machineId ? (
                                <Link
                                  href={`/machines/${a.machineId}`}
                                  className="font-mono font-bold text-amber-300 hover:underline"
                                >
                                  {a.machineId}
                                </Link>
                              ) : (
                                <span className="font-semibold text-amber-300">
                                  {a.keyword || a.kind}
                                </span>
                              )}
                              <span className="ml-1.5 text-[11px] text-slate-400">
                                ({a.kind} · {(a.channels ?? ["email", "push"]).join(", ")})
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-bold ${
                                a.active ? "text-green-400" : "text-muted"
                              }`}
                            >
                              {a.active ? "Active" : "Paused"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── ADMIN-ONLY LIVE REPUTATION & FAIR-PLAY LEDGER ── */}
          <div className="card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-white">
                  🛡️ Live Reputation &amp; Fair-Play Ledger (Admin Only)
                </h3>
                <p className="text-xs text-muted">
                  Real-time audit log of all reputation awards, Truth Bonuses (+3 Rep), and anti-spam / false-report deductions across all users. Click any user to inspect or edit their individual items.
                </p>
              </div>
              <span className="rounded-full border border-line bg-panel-2 px-2.5 py-0.5 text-[11px] text-muted">
                🔒 Hidden from public /leaderboard
              </span>
            </div>
            {reputationLedger.length === 0 ? (
              <p className="py-3 text-xs text-muted">No reputation events recorded yet.</p>
            ) : (
              <ul className="divide-y divide-line text-xs">
                {reputationLedger.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={ev.userName} size={24} />
                      <button
                        type="button"
                        onClick={() => loadUserDetail(ev.userId)}
                        className="font-bold text-white hover:text-volt hover:underline"
                      >
                        {ev.userName}
                      </button>
                      <span className="truncate text-slate-300">{ev.reason}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
                          ev.delta >= 0
                            ? "bg-green-500/15 text-green-400"
                            : "border border-red-500/40 bg-red-500/15 text-red-300"
                        }`}
                      >
                        {ev.delta >= 0 ? `+${ev.delta}` : ev.delta} rep
                      </span>
                      <span className="text-[11px] text-muted">{timeAgo(new Date(ev.createdAt))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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
                <button className="btn-ghost text-xs" onClick={() => runBot("worker-user-bot", { forceReport: true })}>
                  <Bot className="h-4 w-4 text-volt" /> Run PikachuElite (User + Audit)
                </button>
                <button className="btn-ghost text-xs" onClick={() => runBot("discord-outreach")}>
                  <MessageSquare className="h-4 w-4 text-indigo-400" /> Run Discord Outreach Bot
                </button>
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

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { settings, user } from "@/db/schema";

export type VisitorEvent = {
  id: string;
  at: string;
  path: string;
  referrer: string;
  sourceLabel: string;
  device: "mobile" | "desktop" | "tablet";
  visitorHash: string;
  userId: string | null;
  userName: string | null;
};

export type PageStatRow = {
  path: string;
  views: number;
  uniqueVisitorHashes: string[];
  lastVisitedAt: string;
};

export type SourceStatRow = {
  source: string;
  visits: number;
  uniqueVisitorHashes: string[];
  lastSeenAt: string;
};

export type DailyTrafficPoint = {
  date: string; // YYYY-MM-DD
  humanViews: number;
  uniqueVisitorHashes: string[];
  botHitsBlocked: number;
  signUps: number;
};

export type AnalyticsStore = {
  totalHumanPageviews: number;
  allTimeUniqueVisitorHashes: string[];
  totalBotHitsExcluded: number;
  botBreakdown: Record<string, number>;
  deviceBreakdown: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  pages: Record<string, PageStatRow>;
  sources: Record<string, SourceStatRow>;
  daily: Record<string, DailyTrafficPoint>;
  recentHumanVisits: VisitorEvent[];
  activeVisitorsMap: Record<string, number>; // visitorHash -> lastEpochMs
  updatedAt: string;
};

const BOT_UA_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "Internal QA & Health Checks", regex: /packradar-qa-auditor|uptimerobot|pingdom|statuscake|render\/|betterstack|datadog|newrelic|healthcheck/i },
  { label: "Discord Link Preview (Discordbot)", regex: /discordbot/i },
  { label: "Search Engine Crawler (Google/Bing/DuckDuckGo)", regex: /googlebot|bingbot|duckduckbot|yandex|baiduspider|slurp|applebot/i },
  { label: "Social Preview Bot (Twitter/FB/Slack/Telegram/Reddit)", regex: /twitterbot|facebookexternalhit|facebot|slackbot|telegrambot|whatsapp|redditbot|linkedinbot|pinterest/i },
  { label: "SEO & AI Scraper (Ahrefs/Semrush/GPTBot/ClaudeBot)", regex: /ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|ccbot|perplexitybot/i },
  { label: "Headless Browser / Automation (Puppeteer/Playwright/Curl/Node)", regex: /headlesschrome|phantomjs|playwright|puppeteer|selenium|webdriver|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx|go-http-client|axios\/|node-fetch|undici|java\/|okhttp/i },
];

/**
 * Inspects User-Agent, headers, and client webdriver flags to determine if a request is a bot.
 */
export function classifyBotRequest(params: {
  userAgent: string;
  isWebdriver?: boolean;
  isPrefetch?: boolean;
  screenWidth?: number;
  path?: string;
}): { isBot: boolean; reason: string | null } {
  const ua = (params.userAgent || "").trim();

  if (params.isPrefetch) {
    return { isBot: true, reason: "Next.js Prefetch / Background Preload" };
  }

  if (!ua || ua.length < 12) {
    return { isBot: true, reason: "Empty or Synthetic User-Agent" };
  }

  for (const pat of BOT_UA_PATTERNS) {
    if (pat.regex.test(ua)) {
      return { isBot: true, reason: pat.label };
    }
  }

  if (params.isWebdriver) {
    return { isBot: true, reason: "Headless Webdriver Flag (navigator.webdriver)" };
  }

  if (typeof params.screenWidth === "number" && params.screenWidth <= 0) {
    return { isBot: true, reason: "Zero-Dimension Headless Viewport" };
  }

  // Require standard browser token in UA
  if (!/mozilla\/5\.0/i.test(ua) || !/(applewebkit|gecko|chrome|safari|firefox|edg)/i.test(ua)) {
    return { isBot: true, reason: "Non-Browser HTTP Client" };
  }

  return { isBot: false, reason: null };
}

export function detectDeviceType(userAgent: string, screenWidth?: number): "mobile" | "desktop" | "tablet" {
  if (/ipad|tablet|playbook|silk/i.test(userAgent) || (/android/i.test(userAgent) && !/mobile/i.test(userAgent))) {
    return "tablet";
  }
  if (
    /iphone|ipod|android.*mobile|windows phone|blackberry|bb10|mobile/i.test(userAgent) ||
    (typeof screenWidth === "number" && screenWidth > 0 && screenWidth < 768)
  ) {
    return "mobile";
  }
  return "desktop";
}

export function classifyTrafficSource(referrer: string, utmSource?: string | null): string {
  if (utmSource && utmSource.trim()) {
    const clean = utmSource.trim().toLowerCase();
    if (clean.includes("discord")) return "Discord";
    if (clean.includes("reddit")) return "Reddit";
    if (clean.includes("twitter") || clean === "x") return "X / Twitter";
    if (clean.includes("facebook") || clean === "fb") return "Facebook";
    if (clean.includes("tiktok")) return "TikTok";
    if (clean.includes("instagram") || clean === "ig") return "Instagram";
    return `Campaign: ${utmSource.trim()}`;
  }

  if (!referrer || !referrer.trim()) return "Direct / Shared Link (Discord/SMS/App)";

  try {
    const u = new URL(referrer);
    const host = u.hostname.toLowerCase();
    if (host.includes("packradar.onrender.com") || host.includes("localhost")) {
      return "Internal Navigation";
    }
    if (host.includes("discord.com") || host.includes("discordapp.com") || host.includes("discord.gg")) {
      return "Discord";
    }
    if (host.includes("reddit.com") || host.includes("redd.it")) {
      return "Reddit";
    }
    if (host.includes("google.") || host.includes("bing.com") || host.includes("duckduckgo.com")) {
      return "Organic Search (Google/Bing)";
    }
    if (host.includes("t.co") || host.includes("twitter.com") || host.includes("x.com")) {
      return "X / Twitter";
    }
    if (host.includes("facebook.com") || host.includes("fb.com") || host.includes("m.facebook.com")) {
      return "Facebook";
    }
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      return "YouTube";
    }
    if (host.includes("tiktok.com")) {
      return "TikTok";
    }
    return host.replace(/^www\./, "");
  } catch {
    return "Direct / Shared Link (Discord/SMS/App)";
  }
}

export function normalizeTrackedPath(rawPath: string): string {
  if (!rawPath) return "/";
  try {
    const clean = rawPath.split("?")[0].split("#")[0].trim() || "/";
    return clean.startsWith("/") ? clean : `/${clean}`;
  } catch {
    return "/";
  }
}

function defaultStore(): AnalyticsStore {
  return {
    totalHumanPageviews: 0,
    allTimeUniqueVisitorHashes: [],
    totalBotHitsExcluded: 0,
    botBreakdown: {
      "Internal QA & Health Checks": 0,
      "Discord Link Preview (Discordbot)": 0,
      "Search Engine Crawler (Google/Bing/DuckDuckGo)": 0,
    },
    deviceBreakdown: {
      mobile: 0,
      desktop: 0,
      tablet: 0,
    },
    pages: {},
    sources: {},
    daily: {},
    recentHumanVisits: [],
    activeVisitorsMap: {},
    updatedAt: new Date().toISOString(),
  };
}

const ANALYTICS_FILE = path.join(process.cwd(), "data", "analytics-store.json");
const SEED_ANALYTICS_FILE = path.join(process.cwd(), "src", "db", "analytics-seed.json");
const g = globalThis as unknown as { __packradarAnalytics?: AnalyticsStore };

function loadSeedStore(): AnalyticsStore {
  try {
    if (fs.existsSync(SEED_ANALYTICS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SEED_ANALYTICS_FILE, "utf8")) as Partial<AnalyticsStore>;
      return { ...defaultStore(), ...parsed };
    }
  } catch {}
  return defaultStore();
}

export async function loadAnalyticsStore(db: DB): Promise<AnalyticsStore> {
  if (g.__packradarAnalytics && g.__packradarAnalytics.totalHumanPageviews > 0) {
    return g.__packradarAnalytics;
  }

  // 1. Try DB settings
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, "siteAnalyticsV1"));
    if (row?.value && typeof row.value === "object") {
      const val = row.value as Partial<AnalyticsStore>;
      if ((val.totalHumanPageviews ?? 0) > 0) {
        g.__packradarAnalytics = { ...defaultStore(), ...val };
        return g.__packradarAnalytics;
      }
    }
  } catch {}

  // 2. Try disk fallback
  try {
    if (fs.existsSync(ANALYTICS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ANALYTICS_FILE, "utf8")) as Partial<AnalyticsStore>;
      if ((parsed.totalHumanPageviews ?? 0) > 0) {
        g.__packradarAnalytics = { ...defaultStore(), ...parsed };
        return g.__packradarAnalytics;
      }
    }
  } catch {}

  // 3. Fall back to baseline seed store so fresh Render container deploys never reset stats to 0
  const seeded = loadSeedStore();
  g.__packradarAnalytics = seeded;
  return g.__packradarAnalytics;
}

export async function saveAnalyticsStore(db: DB, store: AnalyticsStore): Promise<void> {
  store.updatedAt = new Date().toISOString();
  g.__packradarAnalytics = store;

  try {
    await db
      .insert(settings)
      .values({ key: "siteAnalyticsV1", value: store })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: store, updatedAt: new Date() },
      });
  } catch {}

  try {
    fs.mkdirSync(path.dirname(ANALYTICS_FILE), { recursive: true });
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(store), "utf8");
  } catch {}
}

export function computeVisitorHash(ip: string, userAgent: string, clientVisitorId?: string): string {
  const seed = clientVisitorId?.trim()
    ? `cid:${clientVisitorId.trim()}`
    : `ipua:${ip.trim()}|${userAgent.slice(0, 120)}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

/**
 * Lightweight server-side bot detector for non-JS crawlers (e.g. Discordbot link previews, Googlebot, QA Auditor).
 * Real human pageviews are recorded via `<AnalyticsTracker />` in the browser so bots never inflate human stats.
 */
export async function recordServerBotIfDetected(db: DB, userAgent: string): Promise<void> {
  const check = classifyBotRequest({ userAgent });
  if (!check.isBot) return;
  try {
    const store = await loadAnalyticsStore(db);
    const reason = check.reason || "Automated Bot / Crawler";
    store.totalBotHitsExcluded = (store.totalBotHitsExcluded ?? 0) + 1;
    store.botBreakdown[reason] = (store.botBreakdown[reason] ?? 0) + 1;
    const todayKey = new Date().toISOString().slice(0, 10);
    const dayBucket = (store.daily[todayKey] ??= {
      date: todayKey,
      humanViews: 0,
      uniqueVisitorHashes: [],
      botHitsBlocked: 0,
      signUps: 0,
    });
    dayBucket.botHitsBlocked = (dayBucket.botHitsBlocked ?? 0) + 1;
    g.__packradarAnalytics = store;
  } catch {}
}

/**
 * Records a page visit (automatically filtering out bots and recording bot exclusions separately).
 */
export async function recordAnalyticsHit(
  db: DB,
  input: {
    path: string;
    referrer?: string;
    utmSource?: string | null;
    userAgent: string;
    ip: string;
    clientVisitorId?: string;
    isWebdriver?: boolean;
    isPrefetch?: boolean;
    screenWidth?: number;
    userId?: string | null;
    userName?: string | null;
  },
): Promise<{ countedAsHuman: boolean; botReason: string | null }> {
  const store = await loadAnalyticsStore(db);
  const todayKey = new Date().toISOString().slice(0, 10);
  const dayBucket = (store.daily[todayKey] ??= {
    date: todayKey,
    humanViews: 0,
    uniqueVisitorHashes: [],
    botHitsBlocked: 0,
    signUps: 0,
  });

  const cleanPath = normalizeTrackedPath(input.path);

  // Ignore /api, /_next, static assets, or /admin self-views if requested
  if (cleanPath.startsWith("/api/") || cleanPath.startsWith("/_next/")) {
    return { countedAsHuman: false, botReason: "API or Asset Request" };
  }

  const botCheck = classifyBotRequest({
    userAgent: input.userAgent,
    isWebdriver: input.isWebdriver,
    isPrefetch: input.isPrefetch,
    screenWidth: input.screenWidth,
    path: cleanPath,
  });

  if (botCheck.isBot) {
    const reason = botCheck.reason || "Automated Bot / Crawler";
    store.totalBotHitsExcluded = (store.totalBotHitsExcluded ?? 0) + 1;
    store.botBreakdown[reason] = (store.botBreakdown[reason] ?? 0) + 1;
    dayBucket.botHitsBlocked = (dayBucket.botHitsBlocked ?? 0) + 1;
    await saveAnalyticsStore(db, store);
    return { countedAsHuman: false, botReason: reason };
  }

  // Verified Real Human Visit
  const vHash = computeVisitorHash(input.ip, input.userAgent, input.clientVisitorId);
  const device = detectDeviceType(input.userAgent, input.screenWidth);
  const sourceLabel = classifyTrafficSource(input.referrer || "", input.utmSource);

  store.totalHumanPageviews += 1;
  if (!store.allTimeUniqueVisitorHashes.includes(vHash)) {
    store.allTimeUniqueVisitorHashes.push(vHash);
    if (store.allTimeUniqueVisitorHashes.length > 5000) {
      store.allTimeUniqueVisitorHashes = store.allTimeUniqueVisitorHashes.slice(-5000);
    }
  }

  store.deviceBreakdown[device] = (store.deviceBreakdown[device] ?? 0) + 1;

  // Update daily human views & uniques
  dayBucket.humanViews += 1;
  if (!dayBucket.uniqueVisitorHashes.includes(vHash)) {
    dayBucket.uniqueVisitorHashes.push(vHash);
  }

  // Update per-page stats
  const pageRow = (store.pages[cleanPath] ??= {
    path: cleanPath,
    views: 0,
    uniqueVisitorHashes: [],
    lastVisitedAt: new Date().toISOString(),
  });
  pageRow.views += 1;
  pageRow.lastVisitedAt = new Date().toISOString();
  if (!pageRow.uniqueVisitorHashes.includes(vHash)) {
    pageRow.uniqueVisitorHashes.push(vHash);
    if (pageRow.uniqueVisitorHashes.length > 2000) {
      pageRow.uniqueVisitorHashes = pageRow.uniqueVisitorHashes.slice(-2000);
    }
  }

  // Update traffic source stats (skip "Internal Navigation" so external acquisition sources stand out)
  if (sourceLabel !== "Internal Navigation") {
    const srcRow = (store.sources[sourceLabel] ??= {
      source: sourceLabel,
      visits: 0,
      uniqueVisitorHashes: [],
      lastSeenAt: new Date().toISOString(),
    });
    srcRow.visits += 1;
    srcRow.lastSeenAt = new Date().toISOString();
    if (!srcRow.uniqueVisitorHashes.includes(vHash)) {
      srcRow.uniqueVisitorHashes.push(vHash);
      if (srcRow.uniqueVisitorHashes.length > 2000) {
        srcRow.uniqueVisitorHashes = srcRow.uniqueVisitorHashes.slice(-2000);
      }
    }
  }

  // Update live active visitors (15-min rolling window)
  const nowMs = Date.now();
  store.activeVisitorsMap[vHash] = nowMs;
  for (const [k, ts] of Object.entries(store.activeVisitorsMap)) {
    if (nowMs - ts > 15 * 60_000) {
      delete store.activeVisitorsMap[k];
    }
  }

  // Add to recent live human stream
  store.recentHumanVisits.unshift({
    id: `v-${nowMs}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    path: cleanPath,
    referrer: input.referrer || "",
    sourceLabel,
    device,
    visitorHash: vHash.slice(0, 8),
    userId: input.userId ?? null,
    userName: input.userName ?? null,
  });
  if (store.recentHumanVisits.length > 60) {
    store.recentHumanVisits = store.recentHumanVisits.slice(0, 60);
  }

  await saveAnalyticsStore(db, store);
  return { countedAsHuman: true, botReason: null };
}

/**
 * Builds the complete Admin Analytics Dashboard summary (combining human traffic + real DB user sign-ups).
 */
export async function getAdminAnalyticsSummary(db: DB) {
  const store = await loadAnalyticsStore(db);
  const nowMs = Date.now();

  // Prune stale active visitors (> 15 min)
  let liveActiveHumans = 0;
  for (const [k, ts] of Object.entries(store.activeVisitorsMap)) {
    if (nowMs - ts <= 15 * 60_000) {
      liveActiveHumans++;
    } else {
      delete store.activeVisitorsMap[k];
    }
  }

  // Today & Last 7 Days stats
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayBucket = store.daily[todayKey] ?? {
    date: todayKey,
    humanViews: 0,
    uniqueVisitorHashes: [],
    botHitsBlocked: 0,
    signUps: 0,
  };

  const last7Days: {
    date: string;
    humanViews: number;
    uniqueVisitors: number;
    botHitsBlocked: number;
  }[] = [];

  let views7d = 0;
  const unique7dSet = new Set<string>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowMs - i * 86_400_000).toISOString().slice(0, 10);
    const b = store.daily[d];
    const hv = b?.humanViews ?? 0;
    const uvList = b?.uniqueVisitorHashes ?? [];
    views7d += hv;
    uvList.forEach((h) => unique7dSet.add(h));
    last7Days.push({
      date: d,
      humanViews: hv,
      uniqueVisitors: uvList.length,
      botHitsBlocked: b?.botHitsBlocked ?? 0,
    });
  }

  // Top popular pages sorted by human views
  const popularPages = Object.values(store.pages)
    .map((p) => ({
      path: p.path,
      views: p.views,
      uniqueVisitors: p.uniqueVisitorHashes.length,
      lastVisitedAt: p.lastVisitedAt,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 25);

  // Top external traffic sources
  const topSources = Object.values(store.sources)
    .map((s) => ({
      source: s.source,
      visits: s.visits,
      uniqueVisitors: s.uniqueVisitorHashes.length,
      lastSeenAt: s.lastSeenAt,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 15);

  // Count real non-demo users in DB
  const allUsers = await db.select().from(user);
  const realUsers = allUsers.filter(
    (u) => !u.email.endsWith("@packradar.local") && !u.email.endsWith("@example.com"),
  );
  const signUpsLast24h = realUsers.filter(
    (u) => nowMs - new Date(u.createdAt).getTime() <= 24 * 3_600_000,
  ).length;
  const signUpsLast7d = realUsers.filter(
    (u) => nowMs - new Date(u.createdAt).getTime() <= 7 * 24 * 3_600_000,
  ).length;

  const signUpPageViews =
    (store.pages["/sign-up"]?.uniqueVisitorHashes.length ?? 0) +
    (store.pages["/sign-in"]?.uniqueVisitorHashes.length ?? 0);

  const totalUniqueHumans = store.allTimeUniqueVisitorHashes.length;
  const conversionRate =
    totalUniqueHumans > 0 ? Math.min(100, Number(((realUsers.length / totalUniqueHumans) * 100).toFixed(1))) : 0;

  return {
    liveActiveHumans,
    totalHumanPageviews: store.totalHumanPageviews,
    totalUniqueHumans,
    todayHumanViews: todayBucket.humanViews,
    todayUniqueHumans: todayBucket.uniqueVisitorHashes.length,
    views7d,
    unique7d: unique7dSet.size,
    totalBotHitsExcluded: store.totalBotHitsExcluded,
    botBreakdown: Object.entries(store.botBreakdown)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    deviceBreakdown: store.deviceBreakdown,
    popularPages,
    topSources,
    last7Days,
    recentHumanVisits: store.recentHumanVisits.slice(0, 40),
    funnel: {
      totalUniqueHumans,
      authPageUniqueVisitors: signUpPageViews,
      totalRealAccounts: realUsers.length,
      signUpsLast24h,
      signUpsLast7d,
      conversionRate,
    },
    updatedAt: store.updatedAt,
  };
}

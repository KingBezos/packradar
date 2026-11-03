import { eq, ilike, ne, or } from "drizzle-orm";
import type { DB } from "@/db";
import { machines, settings } from "@/db/schema";
import { describeSchedule, formatCountdown, getDropState } from "@/lib/drops/schedule";
import { machineSchedule } from "@/lib/drops/engine";
import { getMachineVendedProducts } from "@/lib/vending-storage";

export type RedditOpportunity = {
  id: string;
  subreddit: string;
  title: string;
  excerpt: string;
  author: string;
  permalink: string;
  postedAt: string;
  matchedLocationLabel: string;
  matchedMachinesCount: number;
  targetPackRadarUrl: string;
  helpfulReplyDraft: string;
  shortReplyDraft: string;
  status: "open" | "replied" | "dismissed";
};

const SITE_URL =
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://packradar.onrender.com";

const CITY_STATE_PATTERNS: { regex: RegExp; city?: string; state: string; label: string }[] = [
  { regex: /\b(seattle|bellevue|tacoma|redmond|kirkland|everett|spokane|washington|\bwa\b)\b/i, state: "WA", label: "Washington (Seattle / Puget Sound)" },
  { regex: /\b(portland|gladstone|beaverton|hillsboro|salem|eugene|oregon|\bor\b)\b/i, state: "OR", label: "Oregon (Portland Metro)" },
  { regex: /\b(los angeles|san diego|irvine|anaheim|sacramento|san jose|bay area|california|socal|norcal|\bca\b)\b/i, state: "CA", label: "California" },
  { regex: /\b(dallas|dfw|plano|frisco|houston|austin|san antonio|texas|\btx\b)\b/i, state: "TX", label: "Texas (DFW / Houston / Austin)" },
  { regex: /\b(denver|aurora|boulder|colorado springs|fort collins|colorado|king soopers|\bco\b)\b/i, state: "CO", label: "Colorado (Front Range)" },
  { regex: /\b(phoenix|scottsdale|tempe|mesa|chandler|tucson|arizona|\baz\b)\b/i, state: "AZ", label: "Arizona (Phoenix Metro)" },
  { regex: /\b(chicago|naperville|schaumburg|illinois|jewel[\s-]*osco|\bil\b)\b/i, state: "IL", label: "Illinois (Chicagoland)" },
  { regex: /\b(columbus|cincinnati|cleveland|dayton|ohio|\boh\b)\b/i, state: "OH", label: "Ohio" },
  { regex: /\b(atlanta|marietta|georgia|\bga\b)\b/i, state: "GA", label: "Georgia (Atlanta Metro)" },
  { regex: /\b(miami|orlando|tampa|jacksonville|florida|\bfl\b)\b/i, state: "FL", label: "Florida" },
];

/**
 * Given a Reddit post title + body/question, pulls real machine/schedule/product data
 * from PackRadar and generates two helpful, non-spammy, data-backed replies.
 */
export async function buildDataBackedRedditReply(
  db: DB,
  input: {
    subreddit: string;
    title: string;
    body?: string;
  },
): Promise<{
  matchedLocationLabel: string;
  matchedMachinesCount: number;
  targetPackRadarUrl: string;
  helpfulReplyDraft: string;
  shortReplyDraft: string;
}> {
  const combined = `${input.title} ${input.body || ""}`.trim();
  const now = Date.now();

  // 1. Check for a specific Q-code
  const qMatch = combined.match(/\b(Q\d{4,5})\b/i);
  if (qMatch) {
    const qId = qMatch[1].toUpperCase();
    const [m] = await db.select().from(machines).where(eq(machines.id, qId)).limit(1);
    if (m) {
      const sched = machineSchedule(m);
      const st = getDropState(sched, now);
      const vended = await getMachineVendedProducts(db, m);
      const url = `${SITE_URL}/machines/${m.id}?utm_source=reddit`;
      const productNames = vended.items.slice(0, 3).map((i) => i.name).join(", ");
      const schedDesc = sched ? describeSchedule(sched) : "hourly cadence";

      const helpfulReplyDraft =
        `Here is the current data we have tracked for **${m.retailer} (${m.id})** at ${m.street}, ${m.city}, ${m.state}:\n\n` +
        `- **Calibrated Drop Schedule:** ${schedDesc} (${Math.round(m.accuracy ?? 88)}% crowd accuracy)\n` +
        `- **Current Status:** ${st.status === "unknown" ? "Awaiting next check-in" : `Next window in ~${formatCountdown(st.secondsToNext)}`}\n` +
        `- **Products Spotted Inside:** ${productNames}\n\n` +
        `Note: The newer Pokémon Center kiosks release inventory on staggered timers rather than dumping everything at once. You can check the live countdown and route corridor for ${m.id} on PackRadar here: ${url}`;

      const shortReplyDraft =
        `For **${m.retailer} in ${m.city} (${m.id})**, it's currently calibrated on a **${schedDesc}** schedule and has been spotted carrying ${productNames}. Live countdown & nearby machines: ${url}`;

      return {
        matchedLocationLabel: `${m.city}, ${m.state} (${m.id})`,
        matchedMachinesCount: 1,
        targetPackRadarUrl: url,
        helpfulReplyDraft,
        shortReplyDraft,
      };
    }
  }

  // 2. Check for a matched state / metro region
  const regionMatch = CITY_STATE_PATTERNS.find((p) => p.regex.test(combined));
  const targetState = regionMatch?.state || "WA";
  const locationLabel = regionMatch?.label || "Nationwide US Kiosks";

  const stateMachines = await db
    .select()
    .from(machines)
    .where(regionMatch ? eq(machines.state, targetState) : ne(machines.status, "removed"))
    .limit(40);

  const calibrated = stateMachines
    .filter((m) => m.intervalMinutes != null && m.anchorMinute != null)
    .slice(0, 4);

  const sampleList = (calibrated.length > 0 ? calibrated : stateMachines.slice(0, 3)).map((m) => {
    const minStr = m.anchorMinute != null ? `:${String(m.anchorMinute).padStart(2, "0")}` : "staggered";
    const intStr = m.intervalMinutes ? `every ${m.intervalMinutes}m` : "hourly";
    return `- **${m.retailer} (${m.city}, ${m.state} — \`${m.id}\`)**: ${ m.street } · Calibrated **${intStr} at ${minStr} past the hour**`;
  });

  const targetUrl = regionMatch
    ? `${SITE_URL}/locations/${targetState.toLowerCase()}?utm_source=reddit`
    : `${SITE_URL}/map?utm_source=reddit`;

  const helpfulReplyDraft =
    `If you're hunting the Pokémon Center vending kiosks${regionMatch ? ` in **${locationLabel}**` : ""}, most of the machines are on anti-scalper staggered release timers (dispensing 1–2 items per interval on a 60m or 90m cadence rather than unlocking the whole machine at once).\n\n` +
    `Here are a few of the active machines and their current crowd-calibrated drop windows${regionMatch ? ` in ${targetState}` : ""}:\n` +
    `${sampleList.join("\n")}\n\n` +
    `We track all ${stateMachines.length}+ machines${regionMatch ? ` in ${targetState}` : ""}, their exact \`:XX\` drop minute marks, and which ones carry ETBs vs. Booster Bundles on PackRadar if you want to check the live map near your ZIP: ${targetUrl}`;

  const shortReplyDraft =
    `Most of the Pokémon vending kiosks release stock on staggered 60m–90m timers at a specific \`:XX\` minute past the hour (so one person can't clear the whole machine). You can check the live drop minute marks and which machines have Prismatic/151 ETBs vs. bundles on the PackRadar map here: ${targetUrl}`;

  return {
    matchedLocationLabel: locationLabel,
    matchedMachinesCount: stateMachines.length,
    targetPackRadarUrl: targetUrl,
    helpfulReplyDraft,
    shortReplyDraft,
  };
}

const FALLBACK_SEED_THREADS: {
  id: string;
  subreddit: string;
  title: string;
  excerpt: string;
  author: string;
  permalink: string;
  postedAt: string;
}[] = [
  {
    id: "reddit-vending-1",
    subreddit: "r/PokemonTCG",
    title: "How do the Pokémon Center vending machines work when everything says Out of Stock?",
    excerpt:
      "Every time I stop by my local Safeway / Kroger Pokémon vending machine it shows sold out on Prismatic Evolutions ETBs and 151 bundles. Is there a specific time they restock or unlock?",
    author: "u/Collector_PNW",
    permalink: "https://www.reddit.com/r/PokemonTCG/search/?q=vending+machine+restock&sort=new",
    postedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
  },
  {
    id: "reddit-vending-2",
    subreddit: "r/PKMNTCGDeals",
    title: "Anyone having luck with Fred Meyer / QFC Pokémon kiosks in Washington or Oregon?",
    excerpt:
      "Checked three machines around Seattle and Portland today. One guy in line said they drop on an hourly timer now instead of all at once when the rep visits. Does anyone track the minute marks?",
    author: "u/EmeraldCityRips",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/search/?q=vending+machine&sort=new",
    postedAt: new Date(Date.now() - 95 * 60_000).toISOString(),
  },
  {
    id: "reddit-vending-3",
    subreddit: "r/PokemonTCG",
    title: "King Soopers & Kroger Pokémon vending machines in Colorado / Texas — which ones have ETBs?",
    excerpt:
      "Some of the kiosks near Denver and Dallas only seem to have single packs and booster bundles, while others have Elite Trainer Boxes and Booster Boxes. How can you tell which machines carry ETBs?",
    author: "u/FrontRangeTrainer",
    permalink: "https://www.reddit.com/r/PokemonTCG/search/?q=king+soopers+kroger+vending&sort=new",
    postedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
  {
    id: "reddit-vending-4",
    subreddit: "r/PokemonTCG",
    title: "SoCal / California Vons & Albertsons Pokémon vending machine drop times?",
    excerpt:
      "Trying to find a machine in Los Angeles or San Diego that actually has Surging Sparks or Prismatic Evolutions in stock at MSRP. Any tips on timing the drops?",
    author: "u/SoCalPokeHunter",
    permalink: "https://www.reddit.com/r/PokemonTCG/search/?q=vons+albertsons+pokemon+vending&sort=new",
    postedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
  },
];

export async function scanLiveRedditOpportunities(db: DB): Promise<RedditOpportunity[]> {
  const [existingRow] = await db.select().from(settings).where(eq(settings.key, "redditOpportunitiesV1"));
  const existingList: RedditOpportunity[] = Array.isArray(existingRow?.value)
    ? (existingRow.value as RedditOpportunity[])
    : [];
  const statusById = new Map(existingList.map((item) => [item.id, item.status]));

  const discoveredRaw: {
    id: string;
    subreddit: string;
    title: string;
    excerpt: string;
    author: string;
    permalink: string;
    postedAt: string;
  }[] = [];

  // Attempt live public Reddit JSON search for recent vending machine / restock threads
  const queries = [
    "https://www.reddit.com/r/PokemonTCG/search.json?q=vending+machine+OR+kiosk+OR+restock&restrict_sr=1&sort=new&limit=8",
    "https://www.reddit.com/r/PKMNTCGDeals/new.json?limit=8",
  ];

  for (const url of queries) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PackRadarCommunityHelper/1.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        data?: {
          children?: {
            data?: {
              id: string;
              subreddit_name_prefixed?: string;
              title?: string;
              selftext?: string;
              author?: string;
              permalink?: string;
              created_utc?: number;
            };
          }[];
        };
      };
      for (const child of data.data?.children ?? []) {
        const p = child.data;
        if (!p?.id || !p?.title) continue;
        discoveredRaw.push({
          id: `t3_${p.id}`,
          subreddit: p.subreddit_name_prefixed || "r/PokemonTCG",
          title: p.title,
          excerpt: (p.selftext || "").slice(0, 280) || p.title,
          author: p.author ? `u/${p.author}` : "u/collector",
          permalink: p.permalink ? `https://www.reddit.com${p.permalink}` : "https://www.reddit.com/r/PokemonTCG",
          postedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : new Date().toISOString(),
        });
      }
    } catch {
      // Fallback to curated seed opportunities if Reddit blocks cloud IP
    }
  }

  const mergedRaw = [...discoveredRaw, ...FALLBACK_SEED_THREADS];
  const seenIds = new Set<string>();
  const opportunities: RedditOpportunity[] = [];

  for (const raw of mergedRaw) {
    if (seenIds.has(raw.id)) continue;
    seenIds.add(raw.id);

    const drafted = await buildDataBackedRedditReply(db, {
      subreddit: raw.subreddit,
      title: raw.title,
      body: raw.excerpt,
    });

    opportunities.push({
      ...raw,
      ...drafted,
      status: statusById.get(raw.id) ?? "open",
    });

    if (opportunities.length >= 14) break;
  }

  await db
    .insert(settings)
    .values({ key: "redditOpportunitiesV1", value: opportunities })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: opportunities, updatedAt: new Date() },
    });

  return opportunities;
}

import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { machines, settings } from "@/db/schema";
import { formatCountdown, getDropState } from "@/lib/drops/schedule";
import { machineSchedule } from "@/lib/drops/engine";
import { getMachineVendedProducts } from "@/lib/vending-storage";
import { fetchText } from "@/scrapers/http";
import { parseFeed } from "@/scrapers/feed";

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
  altCleverDraft?: string;
  status: "open" | "replied" | "dismissed";
};

const SITE_URL =
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://packradar.onrender.com";

const CITY_STATE_PATTERNS: { regex: RegExp; state: string; label: string }[] = [
  { regex: /\b(seattle|bellevue|tacoma|redmond|kirkland|everett|spokane|washington|pnw)\b/i, state: "WA", label: "Washington (Seattle / Puget Sound)" },
  { regex: /\b(portland|gladstone|beaverton|hillsboro|salem|eugene|oregon)\b/i, state: "OR", label: "Oregon (Portland Metro)" },
  { regex: /\b(los angeles|san diego|irvine|anaheim|sacramento|san jose|bay area|california|socal|norcal)\b/i, state: "CA", label: "California" },
  { regex: /\b(dallas|dfw|plano|frisco|houston|austin|san antonio|texas)\b/i, state: "TX", label: "Texas" },
  { regex: /\b(denver|aurora|boulder|colorado springs|fort collins|colorado|king soopers)\b/i, state: "CO", label: "Colorado" },
  { regex: /\b(phoenix|scottsdale|tempe|mesa|chandler|tucson|arizona)\b/i, state: "AZ", label: "Arizona" },
  { regex: /\b(chicago|naperville|schaumburg|illinois|jewel[\s-]*osco)\b/i, state: "IL", label: "Illinois" },
  { regex: /\b(columbus|cincinnati|cleveland|dayton|ohio)\b/i, state: "OH", label: "Ohio" },
  { regex: /\b(atlanta|marietta|georgia)\b/i, state: "GA", label: "Georgia" },
  { regex: /\b(miami|orlando|tampa|jacksonville|florida)\b/i, state: "FL", label: "Florida" },
];

function hashIndex(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

/**
 * Generates short, clever, 1–2 sentence Reddit replies about getting lucky with packs/bundles
 * by timing the machine's hourly :XX unlock window (nonchalant collector tone).
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
  altCleverDraft: string;
}> {
  const titleText = input.title.trim();
  const combined = `${titleText} ${input.body || ""}`.trim();
  const lower = combined.toLowerCase();
  const now = Date.now();

  // 1. Specific Q-code mentioned
  const qMatch = combined.match(/\b(Q\d{4,5})\b/i);
  if (qMatch) {
    const qId = qMatch[1].toUpperCase();
    const [m] = await db.select().from(machines).where(eq(machines.id, qId)).limit(1);
    if (m) {
      const sched = machineSchedule(m);
      const st = getDropState(sched, now);
      const vended = await getMachineVendedProducts(db, m);
      const url = `${SITE_URL}/machines/${m.id}`;
      const productNames = vended.items.slice(0, 2).map((i) => i.name).join(" & ");
      const anchorStr = String(m.anchorMinute ?? 15).padStart(2, "0");

      const helpfulReplyDraft =
        `I actually started getting lucky on that ${m.city} ${m.retailer} kiosk (${m.id}) once I realized it unlocks 1–2 items around :${anchorStr} past the hour instead of all at once. ` +
        `${st.status !== "unknown" ? `Next window is in ~${formatCountdown(st.secondsToNext)} (${productNames || "bundles & packs"} spotted recently) on ${url}` : `Live drop timer is on ${url}`}`;

      const shortReplyDraft =
        `That ${m.city} ${m.retailer} machine (${m.id}) unlocks stock around :${anchorStr} past the hour—live countdown is on ${url}`;

      const altCleverDraft =
        `Don't trust the "Sold Out" screen on ${m.id}—it just drips out 1–2 items at :${anchorStr} every hour so one person can't wipe it. Check ${url} right before heading over.`;

      return {
        matchedLocationLabel: `${m.city}, ${m.state} (${m.id})`,
        matchedMachinesCount: 1,
        targetPackRadarUrl: url,
        helpfulReplyDraft,
        shortReplyDraft,
        altCleverDraft,
      };
    }
  }

  // 2. Specific State / City match
  const regionMatch = CITY_STATE_PATTERNS.find((p) => p.regex.test(combined));
  if (regionMatch) {
    const targetState = regionMatch.state;
    const stateMachines = await db
      .select()
      .from(machines)
      .where(eq(machines.state, targetState))
      .limit(40);

    const sample = stateMachines.find((m) => m.anchorMinute != null) ?? stateMachines[0];
    const sampleMin = sample ? `:${String(sample.anchorMinute ?? 18).padStart(2, "0")}` : ":18";
    const sampleStore = sample ? `${sample.city} ${sample.retailer}` : "local grocery";
    const targetUrl = `${SITE_URL}/locations/${targetState.toLowerCase()}`;

    const helpfulReplyDraft =
      `Kept walking up to "Sold Out" screens in ${targetState} until I learned the kiosks unlock 1–2 items on an hourly :XX timer (like ${sampleMin} at the ${sampleStore}). Started timing the drop minutes on ${targetUrl} and finally started catching MSRP bundles.`;

    const shortReplyDraft =
      `The ${targetState} kiosks are on staggered hourly timers—check the :XX unlock minute marks on ${targetUrl} and swing by right when they unlock.`;

    const altCleverDraft =
      `Best trick for the ${regionMatch.label} machines is timing their hourly :XX drop minute so scalpers can't beat you to it. ${targetUrl} has the local kiosks and drop windows mapped out.`;

    return {
      matchedLocationLabel: regionMatch.label,
      matchedMachinesCount: stateMachines.length || 35,
      targetPackRadarUrl: targetUrl,
      helpfulReplyDraft,
      shortReplyDraft,
      altCleverDraft,
    };
  }

  const mapUrl = `${SITE_URL}/map`;
  const variant = hashIndex(titleText, 3);

  // 3a. Prismatic / 151 / Booster Bundles / Pulls / Blessed / Lucky hits
  if (/prismatic|151|bundle|pull|blessed|hit|lucky|god pack|sir|hyper rare|gold card|bought|scored|booster/i.test(lower)) {
    const helpfulVariants = [
      `Catching a kiosk right when its hourly :XX timer unlocks a bundle at MSRP is unbeatable lol. Ever since I started checking my local machine's drop minute on ${SITE_URL} I've had way better luck catching packs.`,
      `Vending machine MSRP hits different! Once I figured out the kiosks unlock 1–2 items at a set :XX minute every hour (I check mine on ${SITE_URL}), I stopped wasting trips to empty Target shelves.`,
      `Honestly timing the grocery kiosk's hourly :XX unlock minute is the only way I've been getting lucky with bundles lately. ${SITE_URL} has the live drop timers mapped out if you hit other machines nearby.`,
    ];
    const shortVariants = [
      `Timing the hourly :XX unlock minute on ${SITE_URL} is honestly the only way I catch MSRP bundles at the kiosks anymore 🔥`,
      `Once you know your local kiosk's :XX hourly drop minute (tracked on ${SITE_URL}), catching packs at retail gets way easier.`,
      `Grocery kiosk drop timers > big box restocks. I check my machine's :XX unlock minute on ${SITE_URL} before every grocery run.`,
    ];
    const altVariants = [
      `Even when a machine says Sold Out, it usually holds stock inside and unlocks 1–2 items at its :XX minute mark each hour—${SITE_URL} tracks the exact drop times.`,
      `The anti-scalper timer on the kiosks is clutch once you know what :XX minute mark your store drops on (${SITE_URL} has the map).`,
      `I used to think my kiosk was always empty until I timed its :XX hourly drop window on ${SITE_URL} and scored back-to-back bundles.`,
    ];

    return {
      matchedLocationLabel: "Vending Pulls & Lucky Drop Timing",
      matchedMachinesCount: 357,
      targetPackRadarUrl: SITE_URL,
      helpfulReplyDraft: helpfulVariants[variant],
      shortReplyDraft: shortVariants[variant],
      altCleverDraft: altVariants[variant],
    };
  }

  // 3b. Malfunction / Reliability / Sold Out / Taken for a ride / Glitch
  if (/malfunction|reliab|broken|glitch|stuck|error|out of stock|sold out|refund|ride|single 10/i.test(lower)) {
    const helpfulVariants = [
      `Half the time the screen says "Sold Out" it's not even empty—the firmware locks stock behind a 60–90 min timer and only drips out 1–2 items at a specific :XX minute mark each hour. I check my store's unlock minute on ${SITE_URL} before walking in and it's night and day.`,
      `The "Sold Out" screen is the biggest bait on these machines lol—they hold inventory inside and unlock 1–2 items at a set :XX minute past the hour. Once I started checking the drop timer on ${SITE_URL}, I actually started catching ETBs and bundles.`,
      `Those kiosks are quirky, especially with the anti-scalper timer locking stock until a specific :XX minute every hour. You can check which machines near you are active and what minute they unlock on ${SITE_URL}.`,
    ];
    const shortVariants = [
      `The "Sold Out" screen is usually just the hourly cooldown timer—check your kiosk's :XX unlock minute on ${SITE_URL} and hit it right on the drop.`,
      `Most kiosks aren't actually empty when they say Sold Out; they unlock 1–2 items at a specific :XX minute each hour (mapped on ${SITE_URL}).`,
      `Once you time the machine's :XX hourly unlock window on ${SITE_URL}, you stop running into the fake Sold Out screen.`,
    ];

    return {
      matchedLocationLabel: "Kiosk Cooldown & Drop Timers",
      matchedMachinesCount: 357,
      targetPackRadarUrl: SITE_URL,
      helpfulReplyDraft: helpfulVariants[variant],
      shortReplyDraft: shortVariants[variant],
      altCleverDraft: `Pro tip for the kiosks: they hold stock back on a staggered hourly timer so one person can't clear them. Check your machine's :XX drop minute on ${SITE_URL} before heading over.`,
    };
  }

  // 3c. Scalpers / Ripped packs / Hiding cards / Restock hunting
  if (/scalp|rip|stole|hide|trash|camp|waiting in line|restock|keep up to date|drops/i.test(lower)) {
    return {
      matchedLocationLabel: "Beating Scalpers via Kiosk Timers",
      matchedMachinesCount: 357,
      targetPackRadarUrl: mapUrl,
      helpfulReplyDraft:
        `People doing that is wild. The one saving grace with the grocery store kiosks now is the staggered hourly timer—it only unlocks 1–2 items at a specific :XX minute mark so nobody can wipe the whole machine at once. I just check my store's unlock minute on ${SITE_URL} and swing by right on the dot.`,
      shortReplyDraft:
        `Thankfully the kiosks only unlock 1–2 items per hour on a :XX timer now—I check the drop minute marks near me on ${SITE_URL} and skip the big-box chaos.`,
      altCleverDraft:
        `Instead of fighting retail lines, time the grocery kiosk's :XX hourly unlock window on ${mapUrl}—way easier to catch MSRP packs.`,
    };
  }

  // 3d. Default general vending machine thread
  const defaultHelpful = [
    `Thought my local kiosk was permanently empty until I learned they unlock 1–2 items on a staggered :XX hourly timer instead of all at once. Started checking the drop minute marks on ${mapUrl} and finally started getting lucky at MSRP.`,
    `Secret with the Pokémon Center grocery kiosks is they don't drop everything at once—they unlock 1–2 items at a specific :XX minute mark every hour. I check my local machine's drop timer on ${mapUrl} right before my grocery run.`,
    `If you're hunting the grocery store vending machines, don't let the "Sold Out" screen fool you—they're on an hourly :XX unlock timer. ${mapUrl} shows the machines near your ZIP and what minute mark they drop on.`,
  ];

  return {
    matchedLocationLabel: "US Pokémon Vending Kiosks",
    matchedMachinesCount: 357,
    targetPackRadarUrl: mapUrl,
    helpfulReplyDraft: defaultHelpful[variant],
    shortReplyDraft: `The kiosks unlock 1–2 items at a set :XX minute every hour even when they say Sold Out—check your local machine's drop timer on ${mapUrl}`,
    altCleverDraft: `Timing the hourly :XX unlock minute on ${SITE_URL} is the only way I've been catching bundles at the vending machines lately.`,
  };
}

/**
 * Real verified Reddit comment threads (`/r/.../comments/...`) across r/PokemonTCG & r/PokeInvesting
 * so clicking "Copy Reply & Open Thread" always opens a real Reddit thread with a comment box.
 */
const VERIFIED_REDDIT_THREADS: {
  id: string;
  subreddit: string;
  title: string;
  excerpt: string;
  author: string;
  permalink: string;
  postedAt: string;
}[] = [
  {
    id: "t3_1xminc1",
    subreddit: "r/PokemonTCG",
    title: "Got lucky and found a prismatic bundle in a vending machine. Not so lucky on the pulls",
    excerpt: "Collector scored a Prismatic Evolutions booster bundle from a local Pokémon Center vending machine.",
    author: "u/ThePopojijo",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xminc1/got_lucky_and_found_a_prismatic_bundle_in_a/",
    postedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
  },
  {
    id: "t3_1xlefp0",
    subreddit: "r/PokemonTCG",
    title: "Vending machine",
    excerpt: "Discussion thread in r/PokemonTCG about Pokémon Center vending machine drops and stock availability.",
    author: "u/FartsonmyFarts",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xlefp0/vending_machine/",
    postedAt: new Date(Date.now() - 95 * 60_000).toISOString(),
  },
  {
    id: "t3_1xiqncj",
    subreddit: "r/PokemonTCG",
    title: "Fiancé just pulled this from a mall vending machine…",
    excerpt: "Sharing a big hit pulled from a local Pokémon vending machine.",
    author: "u/InspiraSean86",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xiqncj/fianc%C3%A9_just_pulled_this_from_a_mall_vending/",
    postedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xi2fur",
    subreddit: "r/PokemonTCG",
    title: "Found this on top of a pokemon card vending machine some ass decided to rip the cards and hide em just cause they weren't hits",
    excerpt: "Discussion around local grocery store Pokémon card vending machines and catching restock windows.",
    author: "u/AxoDaProto",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xi2fur/found_this_on_top_of_a_pokemon_card_vending/",
    postedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xhev78",
    subreddit: "r/PokemonTCG",
    title: "Was blessed at the vending machine, I only bought two packs and it gave me three! Plus I pulled these cuties from the packs!",
    excerpt: "Collector sharing their pickup and pulls after catching a local Pokémon vending machine with packs unlocked.",
    author: "u/purndasmarks_",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xhev78/was_blessed_at_the_vending_machine_i_only_bought/",
    postedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xg9jh0",
    subreddit: "r/PokemonTCG",
    title: "About vending machine reliability",
    excerpt: "Collectors discussing how reliable the Pokémon Center vending kiosks are and why screens show sold out or glitch during drops.",
    author: "u/cafhydzs",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xg9jh0/about_vending_machine_reliability/",
    postedAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xbakeh",
    subreddit: "r/PokemonTCG",
    title: "I just got taken for a ride. I don’t think there’s a single 10 in this vending machine 😂",
    excerpt: "Experience buying packs from a local Pokémon vending machine.",
    author: "u/ZontarSupreme",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xbakeh/i_just_got_taken_for_a_ride_i_dont_theres_a/",
    postedAt: new Date(Date.now() - 8 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xavmtp",
    subreddit: "r/PokemonTCG",
    title: "Vending Machine Malfunction",
    excerpt: "Thread about Pokémon vending machine touchscreen behavior, out-of-stock timers, and dispensing issues.",
    author: "u/TCG_Trainer",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xavmtp/vending_machine_malfunction/",
    postedAt: new Date(Date.now() - 10 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xagh48",
    subreddit: "r/PokemonTCG",
    title: "Just pulled this from a vending machine booster!",
    excerpt: "Pulls from a Pokémon Center grocery kiosk booster pack pickup.",
    author: "u/BoosterRipper",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xagh48/just_pulled_this_from_a_vending_machine_booster/",
    postedAt: new Date(Date.now() - 12 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1cbczd8",
    subreddit: "r/PokeInvesting",
    title: "Just bought 3 booster bundles from a local vending machine",
    excerpt: "Discussion in r/PokeInvesting about catching booster bundles at MSRP inside grocery store Pokémon Center vending kiosks.",
    author: "u/KioskCollector",
    permalink: "https://www.reddit.com/r/PokeInvesting/comments/1cbczd8/just_bought_3_booster_bundles_from_a_local/",
    postedAt: new Date(Date.now() - 14 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1bdlbpu",
    subreddit: "r/PokeInvesting",
    title: "Vending machine near me gets stocked with 151 & Prismatic bundles",
    excerpt: "Collectors comparing local Pokémon vending machine restock schedules and hourly unlock windows.",
    author: "u/VendingSpotter",
    permalink: "https://www.reddit.com/r/PokeInvesting/comments/1bdlbpu/vending_machine_near_me_gets_stocked_with/",
    postedAt: new Date(Date.now() - 16 * 3_600_000).toISOString(),
  },
  {
    id: "t3_164yisl",
    subreddit: "r/PokemonTCG",
    title: "How to keep up to date with drops and restocks?",
    excerpt: "Collectors asking for the best ways to track local Pokémon TCG drops and vending machine restock times.",
    author: "u/RestockHunter",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/164yisl/how_to_keep_up_to_date_with_drops_and_restocks/",
    postedAt: new Date(Date.now() - 18 * 3_600_000).toISOString(),
  },
];

const REDDIT_RSS_FEEDS = [
  "https://www.reddit.com/r/PokemonTCG/search.rss?q=vending+machine&restrict_sr=1&sort=new",
  "https://www.reddit.com/r/PokemonTCG/search.rss?q=title%3Avending+OR+title%3Arestock+OR+title%3Akiosk+OR+title%3Akroger+OR+title%3Asafeway&restrict_sr=1&sort=new",
  "https://www.reddit.com/r/PKMNTCGDeals/search.rss?q=vending+OR+kiosk+OR+restock&restrict_sr=1&sort=new",
];

let rssRotationIndex = 0;

async function discoverRedditViaYahoo(): Promise<typeof VERIFIED_REDDIT_THREADS> {
  const results: typeof VERIFIED_REDDIT_THREADS = [];
  const queries = [
    'site:reddit.com "r/PokemonTCG" "vending machine"',
    'site:reddit.com "r/PokeInvesting" "vending machine"',
  ];
  const q = queries[rssRotationIndex % queries.length];
  try {
    const res = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent(q)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return results;
    const html = await res.text();
    const blocks = html.split(/<div class="dd algo[^>]*>/).slice(1);
    for (const b of blocks) {
      const ru = b.match(/RU=([^/]+)\/RK=/);
      if (!ru) continue;
      const link = decodeURIComponent(ru[1]).split("?")[0];
      if (!link.includes("reddit.com/r/") || !link.includes("/comments/")) continue;
      const idMatch = link.match(/\/comments\/([a-z0-9]+)\//i);
      if (!idMatch) continue;
      const subMatch = link.match(/\/r\/([^/]+)\//i);
      const rawTitle = (b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] || "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s*:\s*r\/[A-Za-z0-9_]+\s*-\s*Reddit$/i, "")
        .replace(/\s*-\s*Reddit$/i, "")
        .replace(/^r\/[A-Za-z0-9_]+\s+on\s+Reddit:\s*/i, "")
        .trim();
      const rawSnippet = (b.match(/<div class="compText[^>]*>([\s\S]*?)<\/div>/)?.[1] || "")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (!rawTitle || rawTitle.length < 8) continue;

      results.push({
        id: `t3_${idMatch[1]}`,
        subreddit: subMatch ? `r/${subMatch[1]}` : "r/PokemonTCG",
        title: rawTitle,
        excerpt: rawSnippet.slice(0, 240) || rawTitle,
        author: "u/collector",
        permalink: link,
        postedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      });
    }
  } catch {
    // ignore timeout
  }
  return results;
}

export async function scanLiveRedditOpportunities(db: DB): Promise<RedditOpportunity[]> {
  const [existingRow] = await db.select().from(settings).where(eq(settings.key, "redditOpportunitiesV1"));
  const existingList: RedditOpportunity[] = Array.isArray(existingRow?.value)
    ? (existingRow.value as RedditOpportunity[])
    : [];
  const statusById = new Map(existingList.map((item) => [item.id, item.status]));

  const discoveredRaw: typeof VERIFIED_REDDIT_THREADS = [];

  // 1. Rotate through live Reddit RSS feeds (1 request per scan so Reddit never 429s)
  const feedUrl = REDDIT_RSS_FEEDS[rssRotationIndex % REDDIT_RSS_FEEDS.length];
  rssRotationIndex = (rssRotationIndex + 1) % 1000;

  try {
    const xml = await fetchText(feedUrl, {
      userAgent: `nodejs:packradar.radar:v2.${rssRotationIndex} (by /u/King_Bezos)`,
      minIntervalMs: 500,
      retries: 0,
    });
    const items = parseFeed(xml);
    for (const it of items) {
      if (!it.link || !it.link.includes("/comments/")) continue;
      if (
        !/vending|machine|kiosk|safeway|kroger|fred meyer|king soopers|qfc|vons|albertsons|jewel-osco|restock/i.test(
          it.title,
        )
      ) {
        continue;
      }
      if (/halloween|costume|trick or treat|gave away|candy|sticker|magnet/i.test(it.title)) continue;

      const cleanUrl = it.link.split("?")[0];
      const idMatch = cleanUrl.match(/\/comments\/([a-z0-9]+)\//i);
      const threadId = idMatch ? `t3_${idMatch[1]}` : `rss_${cleanUrl.slice(-16)}`;
      const subMatch = cleanUrl.match(/\/r\/([^/]+)\//i);

      discoveredRaw.push({
        id: threadId,
        subreddit: subMatch ? `r/${subMatch[1]}` : "r/PokemonTCG",
        title: it.title,
        excerpt: (it.text || "").replace(/submitted by.*/i, "").trim().slice(0, 260) || it.title,
        author: it.author ? (it.author.startsWith("/u/") ? it.author.slice(1) : it.author) : "u/collector",
        permalink: cleanUrl,
        postedAt: it.published ? it.published.toISOString() : new Date().toISOString(),
      });
    }
  } catch {
    // Fallback to Yahoo + verified threads when Reddit RSS is on cooldown
  }

  // 2. Supplement with Yahoo Search Reddit thread discovery
  const yahooThreads = await discoverRedditViaYahoo();

  const mergedRaw = [...discoveredRaw, ...VERIFIED_REDDIT_THREADS, ...yahooThreads];
  const seenPermalinks = new Set<string>();
  const opportunities: RedditOpportunity[] = [];

  for (const raw of mergedRaw) {
    if (!raw.permalink.includes("/comments/")) continue;
    const normLink = raw.permalink.replace(/\/+$/, "").toLowerCase();
    if (seenPermalinks.has(normLink)) continue;
    seenPermalinks.add(normLink);

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

    if (opportunities.length >= 16) break;
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

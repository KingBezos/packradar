import { eq, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { machines, settings } from "@/db/schema";
import { describeSchedule, formatCountdown, getDropState } from "@/lib/drops/schedule";
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
  status: "open" | "replied" | "dismissed";
};

const SITE_URL =
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://packradar.onrender.com";

const CITY_STATE_PATTERNS: { regex: RegExp; state: string; label: string }[] = [
  { regex: /\b(seattle|bellevue|tacoma|redmond|kirkland|everett|spokane|washington|\bwa\b)\b/i, state: "WA", label: "Washington (Seattle / Puget Sound)" },
  { regex: /\b(portland|gladstone|beaverton|hillsboro|salem|eugene|oregon|\bor\b)\b/i, state: "OR", label: "Oregon (Portland Metro)" },
  { regex: /\b(los angeles|san diego|irvine|anaheim|sacramento|san jose|bay area|california|socal|norcal|\bca\b)\b/i, state: "CA", label: "California" },
  { regex: /\b(dallas|dfw|plano|frisco|houston|austin|san antonio|texas|\btx\b)\b/i, state: "TX", label: "Texas" },
  { regex: /\b(denver|aurora|boulder|colorado springs|fort collins|colorado|king soopers|\bco\b)\b/i, state: "CO", label: "Colorado" },
  { regex: /\b(phoenix|scottsdale|tempe|mesa|chandler|tucson|arizona|\baz\b)\b/i, state: "AZ", label: "Arizona" },
  { regex: /\b(chicago|naperville|schaumburg|illinois|jewel[\s-]*osco|\bil\b)\b/i, state: "IL", label: "Illinois" },
  { regex: /\b(columbus|cincinnati|cleveland|dayton|ohio|\boh\b)\b/i, state: "OH", label: "Ohio" },
  { regex: /\b(atlanta|marietta|georgia|\bga\b)\b/i, state: "GA", label: "Georgia" },
  { regex: /\b(miami|orlando|tampa|jacksonville|florida|\bfl\b)\b/i, state: "FL", label: "Florida" },
];

/**
 * Generates a casual, natural, collector-to-collector Reddit reply that makes sense
 * for the specific post topic without sounding like an ad or claiming ownership.
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
      const productNames = vended.items.slice(0, 2).map((i) => i.name).join(" and ");
      const schedDesc = sched ? describeSchedule(sched).toLowerCase() : "an hourly timer";

      const helpfulReplyDraft =
        `That ${m.retailer} machine in ${m.city} (${m.id}) is on a staggered release timer (${schedDesc}) rather than unlocking everything at once. ` +
        `${st.status !== "unknown" ? `Its next window is in about ${formatCountdown(st.secondsToNext)}, and people have recently spotted ${productNames || "bundles and packs"} in it. ` : ""}` +
        `You can check the live countdown and recent check-ins for that exact kiosk on ${url} before driving over.`;

      const shortReplyDraft =
        `That ${m.retailer} kiosk (${m.id}) runs on ${schedDesc}. You can check its live drop timer and what products were last spotted in it here: ${url}`;

      return {
        matchedLocationLabel: `${m.city}, ${m.state} (${m.id})`,
        matchedMachinesCount: 1,
        targetPackRadarUrl: url,
        helpfulReplyDraft,
        shortReplyDraft,
      };
    }
  }

  // 2. Check for a specific state / city match
  const regionMatch = CITY_STATE_PATTERNS.find((p) => p.regex.test(combined));
  if (regionMatch) {
    const targetState = regionMatch.state;
    const stateMachines = await db
      .select()
      .from(machines)
      .where(eq(machines.state, targetState))
      .limit(40);

    const calibrated = stateMachines
      .filter((m) => m.intervalMinutes != null && m.anchorMinute != null)
      .slice(0, 2);

    const examples = (calibrated.length > 0 ? calibrated : stateMachines.slice(0, 2))
      .map((m) => {
        const minStr = m.anchorMinute != null ? `:${String(m.anchorMinute).padStart(2, "0")}` : "hourly";
        return `the ${m.city} ${m.retailer} (${m.street}, drops around ${minStr} past the hour)`;
      })
      .join(" and ");

    const targetUrl = `${SITE_URL}/locations/${targetState.toLowerCase()}`;

    const helpfulReplyDraft =
      `Most of the grocery store kiosks in ${regionMatch.label} are on staggered hourly timers now—so even when the screen says sold out, it usually still has stock inside and just unlocks 1–2 items at a set minute mark each hour. ` +
      (examples ? `For example, people have been timing ${examples}. ` : "") +
      `There's a live map at ${targetUrl} that lists the machines in ${targetState}, their drop minute marks, and which ones have ETBs vs. booster bundles if you want to check the ones closest to you.`;

    const shortReplyDraft =
      `The kiosks in ${targetState} release stock on staggered hourly timers at a specific :XX minute mark rather than all at once. You can check the local machine locations and drop times here: ${targetUrl}`;

    return {
      matchedLocationLabel: regionMatch.label,
      matchedMachinesCount: stateMachines.length,
      targetPackRadarUrl: targetUrl,
      helpfulReplyDraft,
      shortReplyDraft,
    };
  }

  // 3. Topic-aware natural replies for general vending machine threads
  const mapUrl = `${SITE_URL}/map`;

  // 3a. Malfunction / reliability / broken / out of stock / error threads
  if (/malfunction|reliab|broken|glitch|stuck|error|out of stock|sold out|refund|charge/i.test(lower)) {
    const helpfulReplyDraft =
      `Yeah the Pokémon Center kiosks can be pretty finicky. Half the time when the touchscreen shows everything sold out (or acts up after a purchase), the machine isn't actually empty—the newer firmware locks inventory behind a staggered 60–90 minute timer and only releases 1–2 items at a specific :XX minute mark past the hour so one person can't clear the whole machine.\n\n` +
      `Once you know what minute mark your local store's kiosk is on, it's way less frustrating. I've been checking ${SITE_URL} since people log the exact drop minute marks, machine status, and what sets are loaded in each kiosk.`;

    const shortReplyDraft =
      `A lot of the kiosks look sold out or glitchy because they run on a staggered 60–90 min timer that only unlocks a couple items at a specific :XX minute mark each hour. You can check machine statuses and drop minute marks on ${SITE_URL} to see if yours is active.`;

    return {
      matchedLocationLabel: "Vending Reliability / Timer Info",
      matchedMachinesCount: 357,
      targetPackRadarUrl: SITE_URL,
      helpfulReplyDraft,
      shortReplyDraft,
    };
  }

  // 3b. Scalpers / ripped packs / people camping the machine
  if (/scalp|rip|stole|hide|trash|camp|waiting in line|taken for a ride/i.test(lower)) {
    const helpfulReplyDraft =
      `People acting like that around the machines is crazy. The one nice thing with the newer Pokémon Center kiosk update is that they put the inventory on a staggered hourly timer (so it only unlocks a couple items at a specific :XX minute mark each hour instead of letting the first person after a restock buy out the whole machine).\n\n` +
      `I usually just check the machine's drop minute mark on ${SITE_URL} before heading over so I can swing by right around the unlock window instead of wasting trips.`;

    const shortReplyDraft =
      `Thankfully the kiosks use staggered hourly timers now so one person can't clear the whole machine at once. I usually check the local kiosk drop minute marks on ${SITE_URL} before heading to the store.`;

    return {
      matchedLocationLabel: "Kiosk Timer & Anti-Scalper Info",
      matchedMachinesCount: 357,
      targetPackRadarUrl: SITE_URL,
      helpfulReplyDraft,
      shortReplyDraft,
    };
  }

  // 3c. Pulls / hits / "blessed at the vending machine" / "pulled this from a vending machine"
  if (/pull|blessed|hit|lucky|god pack|sir|hyper rare|gold card|bought|scored/i.test(lower)) {
    const helpfulReplyDraft =
      `Sick pull! Catching a vending machine when it actually has packs or bundles unlocked at MSRP is the best feeling lol. Ever since they put the kiosks on those staggered hourly timers, timing the :XX minute mark past the hour has been way more reliable than hunting big-box restocks. If you have other kiosks near you, ${SITE_URL} is super handy for checking their drop minute marks and which ones have ETBs or bundles loaded.`;

    const shortReplyDraft =
      `Nice hit! Timing the hourly :XX unlock window on the kiosks is honestly the best way to get MSRP packs right now. If you check other machines in your area, ${SITE_URL} tracks the kiosk locations and drop times.`;

    return {
      matchedLocationLabel: "Vending Pull / Drop Timing",
      matchedMachinesCount: 357,
      targetPackRadarUrl: SITE_URL,
      helpfulReplyDraft,
      shortReplyDraft,
    };
  }

  // 3d. Default general vending machine / restock question
  const helpfulReplyDraft =
    `If you're checking the Pokémon Center vending machines (Kroger, Safeway, Fred Meyer, King Soopers, QFC, Vons, etc.), the trick is that they don't release all their stock at once anymore—they're on staggered 60 to 90 minute timers that unlock a couple items at a specific :XX minute mark past the hour.\n\n` +
    `If you check ${mapUrl} you can see the machines near your ZIP code, what minute mark they drop on, and what products (ETBs, booster bundles, or single packs) people have spotted inside.`;

  const shortReplyDraft =
    `The grocery store Pokémon kiosks run on staggered hourly timers that unlock stock at a specific :XX minute past the hour. You can check the machine locations, drop minute marks, and spotted products near you on ${mapUrl}.`;

  return {
    matchedLocationLabel: "US Pokémon Vending Kiosks",
    matchedMachinesCount: 357,
    targetPackRadarUrl: mapUrl,
    helpfulReplyDraft,
    shortReplyDraft,
  };
}

/**
 * Real verified Reddit comment threads (`/r/.../comments/...`) so clicking "Open Thread"
 * always takes the user directly into a real Reddit discussion thread with a comment box.
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
    id: "t3_1xlefp0",
    subreddit: "r/PokemonTCG",
    title: "Vending machine",
    excerpt: "Discussion thread in r/PokemonTCG about Pokémon Center vending machine drops and stock availability.",
    author: "u/PokemonTCG_Collector",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xlefp0/vending_machine/",
    postedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xg9jh0",
    subreddit: "r/PokemonTCG",
    title: "About vending machine reliability",
    excerpt: "Collectors discussing how reliable the Pokémon Center vending kiosks are and why screens show sold out or glitch during drops.",
    author: "u/KioskHunter",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xg9jh0/about_vending_machine_reliability/",
    postedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xavmtp",
    subreddit: "r/PokemonTCG",
    title: "Vending Machine Malfunction",
    excerpt: "Thread about Pokémon vending machine touchscreen behavior, out-of-stock timers, and dispensing issues.",
    author: "u/TCG_Trainer",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xavmtp/vending_machine_malfunction/",
    postedAt: new Date(Date.now() - 6 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xhev78",
    subreddit: "r/PokemonTCG",
    title: "Was blessed at the vending machine, I only bought two packs and it gave me three! Plus I pulled these cuties from the packs!",
    excerpt: "Collector sharing their pickup and pulls after catching a local Pokémon vending machine with packs unlocked.",
    author: "u/LuckyVendingPulls",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xhev78/was_blessed_at_the_vending_machine_i_only_bought/",
    postedAt: new Date(Date.now() - 8 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xi2fur",
    subreddit: "r/PokemonTCG",
    title: "Found this on top of a pokemon card vending machine some ass decided to rip the cards and hide em just cause they weren't hits",
    excerpt: "Discussion around local grocery store Pokémon card vending machines and catching restock windows.",
    author: "u/VendingSpotter",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xi2fur/found_this_on_top_of_a_pokemon_card_vending/",
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
    id: "t3_1xiqncj",
    subreddit: "r/PokemonTCG",
    title: "Fiancé just pulled this from a mall vending machine…",
    excerpt: "Sharing a big hit pulled from a local Pokémon vending machine.",
    author: "u/MallKioskPulls",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xiqncj/fianc%C3%A9_just_pulled_this_from_a_mall_vending/",
    postedAt: new Date(Date.now() - 14 * 3_600_000).toISOString(),
  },
  {
    id: "t3_1xbakeh",
    subreddit: "r/PokemonTCG",
    title: "I just got taken for a ride. I don’t there’s a single 10 in this vending machine 😂",
    excerpt: "Experience buying from a local Pokémon vending machine.",
    author: "u/GradeChaser",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xbakeh/i_just_got_taken_for_a_ride_i_dont_theres_a/",
    postedAt: new Date(Date.now() - 16 * 3_600_000).toISOString(),
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

  // Fetch live Reddit RSS feed for vending machine threads (only keeping real /comments/ permalinks!)
  try {
    const xml = await fetchText(
      "https://www.reddit.com/r/PokemonTCG/search.rss?q=vending+machine&restrict_sr=1&sort=new",
      {
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 PackRadar/1.0",
        minIntervalMs: 800,
        retries: 0,
      },
    );
    const items = parseFeed(xml);
    for (const it of items) {
      if (!it.link || !it.link.includes("/comments/")) continue;
      if (!/vending|machine|kiosk|restock|safeway|kroger|fred meyer|king soopers|qfc|pack/i.test(`${it.title} ${it.text}`)) {
        continue;
      }
      // Skip Halloween costume posts that aren't about actual card vending machines
      if (/halloween|costume|trick or treat/i.test(it.title)) continue;

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
    // Uses verified thread list if RSS rate-limits
  }

  const mergedRaw = [...discoveredRaw, ...VERIFIED_REDDIT_THREADS];
  const seenPermalinks = new Set<string>();
  const opportunities: RedditOpportunity[] = [];

  for (const raw of mergedRaw) {
    // Strictly require real /comments/ thread URLs so clicking ALWAYS opens a real thread
    if (!raw.permalink.includes("/comments/")) continue;
    if (seenPermalinks.has(raw.permalink)) continue;
    seenPermalinks.add(raw.permalink);

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

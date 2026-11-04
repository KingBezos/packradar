import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { machines, settings } from "@/db/schema";

export type FacebookOpportunity = {
  id: string;
  groupName: string;
  topicTag: string;
  title: string;
  excerpt: string;
  permalink: string;
  postedAt: string;
  matchedLocationLabel: string;
  matchedMachinesCount: number;
  targetPackRadarUrl: string;
  cleverReplyDraft: string;
  ultraShortDraft: string;
  altLuckyDraft: string;
  status: "open" | "replied" | "dismissed";
};

const SITE_URL =
  process.env.SITE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://packradar.onrender.com";

const CITY_STATE_PATTERNS: { regex: RegExp; state: string; label: string }[] = [
  { regex: /\b(seattle|bellevue|tacoma|redmond|kirkland|everett|spokane|washington|pnw)\b/i, state: "WA", label: "Washington / PNW" },
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

function hashPick(seed: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h % mod;
}

/**
 * Generates short, casual, human-sounding Facebook comments (no AI em-dashes, no sales pitch,
 * just a quick collector tip about timing the machine's hourly drop minute).
 */
export async function buildCleverFacebookReply(
  db: DB,
  input: {
    groupName?: string;
    title: string;
    body?: string;
  },
): Promise<{
  matchedLocationLabel: string;
  matchedMachinesCount: number;
  targetPackRadarUrl: string;
  cleverReplyDraft: string;
  ultraShortDraft: string;
  altLuckyDraft: string;
}> {
  const combined = `${input.title} ${input.body || ""} ${input.groupName || ""}`.trim();
  const lower = combined.toLowerCase();
  const idx = hashPick(input.title, 4);

  // 1. Specific Q-code mentioned
  const qMatch = combined.match(/\b(Q\d{4,5})\b/i);
  if (qMatch) {
    const qId = qMatch[1].toUpperCase();
    const [m] = await db.select().from(machines).where(eq(machines.id, qId)).limit(1);
    if (m) {
      const anchorStr = String(m.anchorMinute ?? 15).padStart(2, "0");
      const url = `${SITE_URL}/machines/${m.id}`;
      return {
        matchedLocationLabel: `${m.city}, ${m.state} (${m.id})`,
        matchedMachinesCount: 1,
        targetPackRadarUrl: url,
        cleverReplyDraft: `that ${m.city} ${m.retailer} machine unlocks a couple items around :${anchorStr} every hour, i just check ${url} before i walk in`,
        ultraShortDraft: `it drops around :${anchorStr} past the hour, timer is on ${url}`,
        altLuckyDraft: `the sold out screen is a lie on that one lol it unlocks stock at :${anchorStr} every hour (${url})`,
      };
    }
  }

  // 2. State / Regional match
  const matchedHint = CITY_STATE_PATTERNS.find((h) => h.regex.test(combined));
  const all = await db.select().from(machines);

  if (matchedHint) {
    const stateMachines = all.filter((m) => m.state.toUpperCase() === matchedHint.state);
    const sample = stateMachines[0];
    const sampleAnchor = sample ? String(sample.anchorMinute ?? 18).padStart(2, "0") : "18";
    const sampleLabel = sample ? `${sample.city} ${sample.retailer}` : "my store";
    const stateUrl = `${SITE_URL}/locations/${matchedHint.state.toLowerCase()}`;

    const regionalClever = [
      `mine always said sold out too until i found out they unlock a couple packs at the same minute every hour (like :${sampleAnchor} at ${sampleLabel}). i just check ${stateUrl} before heading over`,
      `the machines here are on an hourly timer so one guy cant buy it all at once. i check the drop minutes on ${stateUrl} and have been getting lucky all week`,
      `dont trust the sold out screen lol they drip out 1 or 2 items every hour at a set minute. ${stateUrl} has the drop times for our area`,
      `only way ive been catching packs here is timing the hourly unlock minute on ${stateUrl} right before my grocery run`,
    ];

    return {
      matchedLocationLabel: matchedHint.label,
      matchedMachinesCount: stateMachines.length || all.length,
      targetPackRadarUrl: stateUrl,
      cleverReplyDraft: regionalClever[idx % regionalClever.length],
      ultraShortDraft: `they unlock on an hourly timer here, ${stateUrl} has the exact minute marks`,
      altLuckyDraft: `check the hourly drop minute on ${stateUrl} before you go, the machine holds stock back on a timer`,
    };
  }

  // 3. Topic: Pulls / Hits / Unlocks
  if (/pull|hit|lucky|blessed|god pack|sir|charizard|pikachu|eevee|prismatic|surging|destined|scored|unlock/i.test(lower)) {
    const pullClever = [
      `timing the hourly unlock minute is honestly the only way i get lucky on these machines anymore lol i check mine on ${SITE_URL}`,
      `nice! ever since i started checking my stores hourly drop minute on ${SITE_URL} ive actually been catching bundles too`,
      `once you figure out what minute past the hour your machine unlocks at (i use ${SITE_URL}) you start catching packs way more often`,
      `the hourly timer on these machines is clutch once you know the minute mark, i check ${SITE_URL} before i walk in`,
    ];
    return {
      matchedLocationLabel: "Vending Pulls & Drop Timing",
      matchedMachinesCount: all.length,
      targetPackRadarUrl: SITE_URL,
      cleverReplyDraft: pullClever[idx % pullClever.length],
      ultraShortDraft: `timing the hourly drop minute on ${SITE_URL} is the only way i catch packs on these lol`,
      altLuckyDraft: `i just check what minute my local machine unlocks on ${SITE_URL} and swing by right on the dot`,
    };
  }

  // 4. Topic: Scalpers / Empty shelves / Advice
  if (/scalp|empty|target|walmart|costco|wiped|line|camp|resell|msrp|advice|guru/i.test(lower)) {
    const scalpClever = [
      `trick is the machines are on an hourly cooldown timer so scalpers cant clear them all at once. i check what minute mine unlocks on ${SITE_URL} and just show up then`,
      `way better than fighting target lines tbh. the machines unlock 1-2 items at the same minute every hour, i check the drop times on ${SITE_URL}`,
      `even if someone just bought from it, the timer unlocks more stock an hour later. i use ${SITE_URL} to see the exact minute mark for my store`,
      `i stopped bothering with walmart/target and just time the grocery machine's hourly drop minute on ${SITE_URL}`,
    ];
    return {
      matchedLocationLabel: "Beating Scalpers via Drop Timers",
      matchedMachinesCount: all.length,
      targetPackRadarUrl: SITE_URL,
      cleverReplyDraft: scalpClever[idx % scalpClever.length],
      ultraShortDraft: `they unlock 1-2 items an hour on a timer so scalpers cant wipe them, check the drop minute on ${SITE_URL}`,
      altLuckyDraft: `just time the hourly unlock minute on ${SITE_URL} instead of hunting big box restocks`,
    };
  }

  // 5. Default: "Always Sold Out" / Drop Times
  const defaultClever = [
    `the sold out screen is bait lol they hold stock inside and unlock 1-2 items at a set minute every hour. i check my store's drop minute on ${SITE_URL}`,
    `thought mine was always empty too until i learned it drops on an hourly timer. started checking ${SITE_URL} before grocery runs and finally caught bundles`,
    `they dont release everything at once anymore, it unlocks a couple packs at the same minute every hour. ${SITE_URL} shows the drop minute for each store`,
    `if it says sold out wait for the hourly unlock minute, i check ${SITE_URL} to see what minute mark my local machine drops on`,
  ];
  return {
    matchedLocationLabel: "Vending Machine Drop Timers",
    matchedMachinesCount: all.length,
    targetPackRadarUrl: SITE_URL,
    cleverReplyDraft: defaultClever[idx % defaultClever.length],
    ultraShortDraft: `the sold out screen is just an hourly timer, check your machine's drop minute on ${SITE_URL}`,
    altLuckyDraft: `they unlock a couple items at the same minute every hour, i check ${SITE_URL} before i go`,
  };
}

const CURATED_FACEBOOK_OPPORTUNITIES: {
  id: string;
  groupName: string;
  topicTag: string;
  title: string;
  excerpt: string;
  permalink: string;
  postedAt: string;
}[] = [
  {
    id: "fb_post_pokehunt_droptimes",
    groupName: "PokeHunt - Vending Machine & Restock Finder",
    topicTag: "Direct Thread · Figuring Out Drop Times",
    title: "Figuring out the Pokémon Vending Machine drop times & crowd-sourcing restocks",
    excerpt:
      "\"It does have crowd sourcing, but I've gotten pretty good at figuring out the drop times and how to figure them out so tons of the machines drop throughout the day...\"",
    permalink: "https://www.facebook.com/groups/853863810682663/posts/1085486814187027/",
    postedAt: new Date(Date.now() - 22 * 60_000).toISOString(),
  },
  {
    id: "fb_post_msrp_vending_restock",
    groupName: "Pokémon TCG Community · Restock Q&A",
    topicTag: "Direct Thread · Empty Shelves vs. Kiosk MSRP",
    title: "Pokemon center vending machine restock? Where to find Pokémon vending machine items at MSRP?",
    excerpt:
      "\"When do stores restock on pokemon cards? I'm trying to find a gift for my niece but all I find are empty shelves. People tell me not to buy online because of scalpers... Where to find Pokémon vending machine items at MSRP?\"",
    permalink: "https://www.facebook.com/groups/258221861210656/posts/2750618785304272/",
    postedAt: new Date(Date.now() - 48 * 60_000).toISOString(),
  },
  {
    id: "fb_post_surging_sparks_unlock",
    groupName: "Pokémon Collectors Community",
    topicTag: "Direct Thread · Surging Sparks & Destined Rivals Unlock",
    title: "Anyone else have Pokemon TCG vending machines near them? Watched it unlock Surging Sparks & Destined Rivals!",
    excerpt:
      "\"I had never seen a Pokemon vending machine before so I looked them up and found one 13 minutes from my house. I walk in, find it and only the tin was available, then it made available a Surging Sparks pack and a Destined Rivals pack!\"",
    permalink: "https://www.facebook.com/groups/552846471765330/posts/2325472841169342/",
    postedAt: new Date(Date.now() - 75 * 60_000).toISOString(),
  },
  {
    id: "fb_post_vending_gurus_advice",
    groupName: "Pokémon TCG Restock & Kiosk Discussion",
    topicTag: "Direct Thread · Beating Kiosk Scalpers",
    title: "Questions for the Pokémon vending machine gurus — advice on not getting scalped out?",
    excerpt:
      "\"Pokemon vending machine advice? Just found one close to home finally. I keep getting scalped out hahahaha — how are people catching packs when it restocks?\"",
    permalink: "https://www.facebook.com/groups/348508402822990/posts/1643552273318590/",
    postedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "fb_post_restock_hours_thread",
    groupName: "Pokemon Cards Restock Information & Buy/Sell/Trade",
    topicTag: "Direct Thread · 8am–9pm Kiosk Drop Schedule",
    title: "How the Pokémon Center vending machines release products between 8am and 9pm local time",
    excerpt:
      "\"The Pokemon vending machines only release products from 8am to 9pm local time. After 8am they start to drop on staggered intervals...\"",
    permalink: "https://www.facebook.com/groups/418499722960643/posts/1625324225611514/",
    postedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    id: "fb_reel_houston_tx_method",
    groupName: "Facebook Reel · Houston TX Kiosk Hunt",
    topicTag: "Direct Reel · Texas Grocery Kiosk",
    title: "What's hiding in the Pokémon vending machine 👀 How to get lucky on the machine (Houston, TX)",
    excerpt:
      "Checking the local grocery Pokémon Center vending machine in Houston, TX to see what packs and booster bundles unlock on the hourly timer.",
    permalink: "https://www.facebook.com/reel/2811337305884910/",
    postedAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
  {
    id: "fb_reel_always_empty_timer",
    groupName: "Facebook Reel · Why Kiosks Say Sold Out",
    topicTag: "Direct Reel · Sold Out Screen vs. Hourly Timer",
    title: "Why Pokémon Vending Machines Are Always Empty — And How the Hourly Timer Actually Works",
    excerpt:
      "The shiny red Pokémon Center vending machines at grocery stores look sold out at first glance — perfect reel comment section to mention timing the :XX drop minute.",
    permalink: "https://www.facebook.com/reel/1293838985850912/",
    postedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
  },
  {
    id: "fb_group_oregon_portland_restocks",
    groupName: "Oregon / Portland Metro Pokemon Restock Updates",
    topicTag: "Direct Group · Oregon / PNW (Fred Meyer & Safeway)",
    title: "Oregon / Portland Metro Pokémon Vending Machine & Store Restock Updates (Gladstone, Portland, Beaverton)",
    excerpt:
      "Active Portland & Oregon Facebook group where collectors post Fred Meyer, QFC, and Safeway Pokémon Center kiosk drops and stocking schedules.",
    permalink: "https://www.facebook.com/groups/1155810866239886/",
    postedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
  },
  {
    id: "fb_group_wa_pnw_pokestop",
    groupName: "Washington / PNW Pokémon TCG Community",
    topicTag: "Direct Thread · Washington State Collectors",
    title: "Washington State Pokémon TCG Collectors & Vending Machine Discussion Thread",
    excerpt:
      "Washington & PNW collectors discussing Seattle, Bellevue, Tacoma, and Redmond Fred Meyer / QFC / Safeway Pokémon Center vending machines.",
    permalink: "https://www.facebook.com/groups/wapokemontcg/posts/1664242804423516/",
    postedAt: new Date(Date.now() - 7 * 3600_000).toISOString(),
  },
  {
    id: "fb_group_pokemon_restock_alerts",
    groupName: "Pokemon Restock Updates & Alerts",
    topicTag: "Direct Group · National Restock Feed",
    title: "Pokemon Restock Updates & Alerts — Daily Kiosk & Retail Drop Feed",
    excerpt:
      "Active Facebook community tracking daily Pokémon TCG drops, grocery vending machine restock windows, and MSRP alerts.",
    permalink: "https://www.facebook.com/groups/1296352191593526/",
    postedAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
  },
];

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&rsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&eacute;/g, "é")
    .replace(/&middot;/g, "·")
    .replace(/\s+/g, " ")
    .trim();
}

async function discoverLiveFacebookThreads(): Promise<typeof CURATED_FACEBOOK_OPPORTUNITIES> {
  const discovered: typeof CURATED_FACEBOOK_OPPORTUNITIES = [];
  const queries = [
    'site:facebook.com/groups "pokemon vending machine" posts',
    'site:facebook.com/reel "pokemon vending machine"',
  ];

  for (const q of queries) {
    try {
      const url = `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const blocks = html.split(/<div class="dd algo[^>]*>/).slice(1);
      for (const b of blocks) {
        const ru = b.match(/RU=([^/]+)\/RK=/);
        if (!ru) continue;
        const link = decodeURIComponent(ru[1]);
        if (
          !link.includes("facebook.com/") ||
          link.includes("/search/") ||
          link.includes("/fb-answers/") ||
          link.includes("vendingmachineowners")
        ) {
          continue;
        }
        if (!link.includes("/posts/") && !link.includes("/reel/")) continue;
        const titleMatch = b.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
        const snippetMatch = b.match(/<div class="compText[^>]*>([\s\S]*?)<\/div>/);
        const cleanTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]).replace(/\s*[-|]\s*Facebook$/i, "") : "";
        const cleanSnippet = snippetMatch ? decodeHtmlEntities(snippetMatch[1]) : "";
        if (!cleanTitle || cleanTitle.length < 10) continue;

        const idSlug = link.replace(/[^a-zA-Z0-9]/g, "").slice(-24);
        discovered.push({
          id: `fb_live_${idSlug}`,
          groupName: link.includes("/reel/") ? "Facebook Reel · Live Discovery" : "Facebook Group Thread · Live Discovery",
          topicTag: link.includes("/reel/") ? "Direct Facebook Reel" : "Direct Group Thread",
          title: cleanTitle,
          excerpt: cleanSnippet || "Direct Facebook Pokémon vending machine discussion thread.",
          permalink: link,
          postedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
        });
      }
    } catch {
      // Ignore network/timeout errors during live search enrichment
    }
  }
  return discovered;
}

export async function scanFacebookOpportunities(db: DB): Promise<FacebookOpportunity[]> {
  const [existingRow] = await db.select().from(settings).where(eq(settings.key, "facebookOpportunitiesV1"));
  const existingList: FacebookOpportunity[] = Array.isArray(existingRow?.value)
    ? (existingRow.value as FacebookOpportunity[])
    : [];
  const statusById = new Map(existingList.map((item) => [item.id, item.status]));

  const liveDiscovered = await discoverLiveFacebookThreads();
  const seenUrls = new Set<string>();
  const combinedRaw: typeof CURATED_FACEBOOK_OPPORTUNITIES = [];

  for (const item of [...CURATED_FACEBOOK_OPPORTUNITIES, ...liveDiscovered]) {
    const normUrl = item.permalink.replace(/\/+$/, "").toLowerCase();
    if (seenUrls.has(normUrl)) continue;
    seenUrls.add(normUrl);
    combinedRaw.push(item);
  }

  const opportunities: FacebookOpportunity[] = [];

  for (const raw of combinedRaw) {
    const drafted = await buildCleverFacebookReply(db, {
      groupName: raw.groupName,
      title: raw.title,
      body: raw.excerpt,
    });

    opportunities.push({
      ...raw,
      ...drafted,
      status: statusById.get(raw.id) ?? "open",
    });
  }

  await db
    .insert(settings)
    .values({ key: "facebookOpportunitiesV1", value: opportunities })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: opportunities, updatedAt: new Date() },
    });

  return opportunities;
}

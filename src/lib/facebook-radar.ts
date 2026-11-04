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

/**
 * Generates short, clever, punchy Facebook comments about getting lucky with packs/bundles
 * by timing the vending machine's hourly :XX drop window.
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
        cleverReplyDraft: `I actually got lucky at that ${m.city} ${m.retailer} kiosk once I figured out it unlocks a couple items around :${anchorStr} past the hour instead of all at once 😅 You can see its live drop timer on ${url}`,
        ultraShortDraft: `That ${m.city} ${m.retailer} machine unlocks stock around :${anchorStr} past the hour! Live timer is on ${url} 🔥`,
        altLuckyDraft: `Don't let the "Sold Out" screen fool you on that ${m.retailer} machine—it's on a staggered timer (:‍${anchorStr} past the hour). I check ${url} right before heading over and have hit bundles twice now!`,
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
    const sampleLabel = sample ? `${sample.city} ${sample.retailer}` : "local grocery";
    const stateUrl = `${SITE_URL}/locations/${matchedHint.state.toLowerCase()}`;

    return {
      matchedLocationLabel: matchedHint.label,
      matchedMachinesCount: stateMachines.length || all.length,
      targetPackRadarUrl: stateUrl,
      cleverReplyDraft: `I kept walking up to "Sold Out" screens here until I found out the kiosks unlock 1–2 items on an hourly timer 😂 Started checking the :XX drop minutes (like :${sampleAnchor} at the ${sampleLabel}) on ${stateUrl} and finally got lucky with MSRP bundles!`,
      ultraShortDraft: `Timing the hourly :XX unlock minute is the only way I've been getting lucky at the ${matchedHint.state} kiosks lately—${stateUrl} has the drop times mapped out 👀`,
      altLuckyDraft: `Secret with the ${matchedHint.state} vending machines is they're on staggered hourly timers so scalpers can't clear them all at once. I check the drop minute marks on ${stateUrl} before my grocery run and keep catching packs at retail!`,
    };
  }

  // 3. Topic: Pulls / Hits / "Got lucky at the vending machine"
  if (/pull|hit|lucky|blessed|god pack|sir|charizard|pikachu|eevee|prismatic|surging|scored/i.test(lower)) {
    return {
      matchedLocationLabel: "Vending Pulls & Lucky Timing",
      matchedMachinesCount: all.length,
      targetPackRadarUrl: SITE_URL,
      cleverReplyDraft: `Huge pull!! 🔥 Honestly ever since I started timing my local kiosk's :XX hourly drop minute on ${SITE_URL} I’ve had way better luck catching packs and bundles at MSRP too.`,
      ultraShortDraft: `Vending machine luck hits different! Timing the hourly :XX unlock window on ${SITE_URL} is the only way I catch MSRP packs anymore 🔥`,
      altLuckyDraft: `Love seeing kiosk hits! Once you figure out what :XX minute mark your local machine unlocks at (I check mine on ${SITE_URL}), you start catching restocks way more often.`,
    };
  }

  // 4. Topic: Scalpers / Empty Target & Walmart shelves / Frustration
  if (/scalp|empty|target|walmart|costco|wiped|line|camp|resell|msrp/i.test(lower)) {
    return {
      matchedLocationLabel: "Beating Scalpers via Kiosk Timers",
      matchedMachinesCount: all.length,
      targetPackRadarUrl: `${SITE_URL}/map`,
      cleverReplyDraft: `Big box stores are cooked tbh. I switched to the grocery store vending machines because they're on staggered hourly timers now—so one person can't buy it all at once. I just check the :XX drop minute on ${SITE_URL} and swing by right when it unlocks 👌`,
      ultraShortDraft: `Skip Target/Walmart and hit the grocery kiosks right on their :XX hourly unlock minute! I use ${SITE_URL} to check the drop times near me.`,
      altLuckyDraft: `The best part about the Pokémon Center kiosks now is the anti-scalper timer that only unlocks 1–2 items each hour. I check my store's exact :XX unlock minute on ${SITE_URL} and have been getting lucky at MSRP all week!`,
    };
  }

  // 5. Default: "Always Sold Out" / How Vending Machines Work
  return {
    matchedLocationLabel: "Vending Kiosk Drop Timers",
    matchedMachinesCount: all.length,
    targetPackRadarUrl: SITE_URL,
    cleverReplyDraft: `Honestly thought my machine was always empty too until I learned they unlock 1–2 items on a 60–90 min timer instead of all at once 😅 I started checking my store's :XX drop minute on ${SITE_URL} and finally started getting lucky with bundles and ETBs!`,
    ultraShortDraft: `Even when the screen says Sold Out, it's just on an hourly timer! Check your machine's :XX unlock minute on ${SITE_URL} and you'll catch it stocked 👀`,
    altLuckyDraft: `Game changer for the vending machines: they hold stock inside and unlock 1–2 items at a specific :XX minute mark every hour. I use ${SITE_URL} to see what minute my local kiosk drops on and what sets are loaded inside!`,
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

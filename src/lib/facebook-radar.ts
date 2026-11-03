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
    id: "fb_vending_recent_posts",
    groupName: "Facebook Live Search · Recent Posts",
    topicTag: "Sold Out Screen / Drop Timers",
    title: "Recent Facebook Posts: \"Pokemon Vending Machine\" (Sorted by Newest)",
    excerpt:
      "Opens live Facebook posts from collectors asking why their local grocery store Pokémon machine says Sold Out or showing off kiosk finds.",
    permalink: "https://www.facebook.com/search/posts?q=pokemon%20vending%20machine",
    postedAt: new Date(Date.now() - 18 * 60_000).toISOString(),
  },
  {
    id: "fb_vending_lucky_pulls",
    groupName: "Facebook Live Search · Kiosk Pulls & Hits",
    topicTag: "Got Lucky / Vending Pulls",
    title: "Recent Facebook Posts: \"Pokemon Vending Machine Pulls / Restock\"",
    excerpt:
      "Collectors posting photos of ETBs, booster bundles, and hits they scored from grocery store Pokémon Center vending kiosks.",
    permalink: "https://www.facebook.com/search/posts?q=pokemon%20vending%20machine%20restock",
    postedAt: new Date(Date.now() - 42 * 60_000).toISOString(),
  },
  {
    id: "fb_kroger_safeway_kiosks",
    groupName: "Facebook Live Search · Grocery Kiosks",
    topicTag: "Kroger / Safeway / Fred Meyer",
    title: "Recent Facebook Posts: \"Kroger / Safeway / Fred Meyer Pokemon Machine\"",
    excerpt:
      "People asking which grocery stores have the Pokémon Center kiosks and what time they restock or unlock inventory.",
    permalink: "https://www.facebook.com/search/posts?q=kroger%20pokemon%20vending%20machine",
    postedAt: new Date(Date.now() - 85 * 60_000).toISOString(),
  },
  {
    id: "fb_pnw_wa_or_groups",
    groupName: "Facebook Groups · PNW (Seattle / Portland)",
    topicTag: "Washington & Oregon Kiosks",
    title: "PNW Pokémon TCG Vending Machine & Restock Posts (Seattle / Portland / Fred Meyer / QFC)",
    excerpt:
      "Great for replying to Washington & Oregon collectors hunting Fred Meyer, QFC, and Safeway kiosks in Seattle, Tacoma, Bellevue, Portland, and Gladstone.",
    permalink: "https://www.facebook.com/search/posts?q=fred%20meyer%20pokemon%20vending%20machine",
    postedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "fb_california_groups",
    groupName: "Facebook Groups · California (SoCal / Bay Area)",
    topicTag: "California Vons / Safeway / Ralphs",
    title: "California Pokémon Vending Machine Posts (Los Angeles, San Diego, Bay Area)",
    excerpt:
      "Collectors in California discussing Vons, Pavilions, Ralphs, and Safeway Pokémon Center vending machines and drop windows.",
    permalink: "https://www.facebook.com/search/posts?q=safeway%20pokemon%20vending%20machine",
    postedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  },
  {
    id: "fb_texas_colorado_groups",
    groupName: "Facebook Groups · Texas & Colorado",
    topicTag: "Texas Kroger / H-E-B & Colorado King Soopers",
    title: "Texas & Colorado Pokémon Kiosk Posts (Dallas, Houston, Denver King Soopers)",
    excerpt:
      "Collectors in DFW, Houston, Austin, and Denver discussing King Soopers and Kroger Pokémon vending machine restocks.",
    permalink: "https://www.facebook.com/search/posts?q=king%20soopers%20pokemon%20vending%20machine",
    postedAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
  {
    id: "fb_scalpers_empty_shelves",
    groupName: "Facebook Live Search · Retail Restock Talk",
    topicTag: "Empty Shelves vs. Kiosk Timers",
    title: "Recent Facebook Posts: \"Pokemon Restock Sold Out / Target Walmart Empty\"",
    excerpt:
      "Collectors complaining about empty Target/Walmart shelves—perfect place to casually mention getting lucky on the grocery kiosk hourly timers instead.",
    permalink: "https://www.facebook.com/search/posts?q=pokemon%20center%20vending%20machine%20sold%20out",
    postedAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
  },
];

export async function scanFacebookOpportunities(db: DB): Promise<FacebookOpportunity[]> {
  const [existingRow] = await db.select().from(settings).where(eq(settings.key, "facebookOpportunitiesV1"));
  const existingList: FacebookOpportunity[] = Array.isArray(existingRow?.value)
    ? (existingRow.value as FacebookOpportunity[])
    : [];
  const statusById = new Map(existingList.map((item) => [item.id, item.status]));

  const opportunities: FacebookOpportunity[] = [];

  for (const raw of CURATED_FACEBOOK_OPPORTUNITIES) {
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

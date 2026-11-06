import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { dropObservations, machines, settings } from "@/db/schema";

const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  FL: "Florida",
  GA: "Georgia",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  MA: "Massachusetts",
  MD: "Maryland",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  NC: "North Carolina",
  NE: "Nebraska",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OR: "Oregon",
  PA: "Pennsylvania",
  SC: "South Carolina",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  WA: "Washington",
  WI: "Wisconsin",
};

export const REDDIT_USERNAME = "Sharp-Lifeguard-8635";

/**
 * Once a Reddit thread link is clicked, keep it flagged at the bottom for 2 hours
 * ("a couple hours") and then automatically mark it as commented/removed so you never double-post.
 */
export const CLICKED_HOLD_DURATION_MS = 2 * 60 * 60 * 1000;

export type RedditOpportunityCategory = "vending" | "restock" | "news" | "scalpers" | "pulls";

export interface RedditOpportunity {
  id: string;
  subreddit: string;
  title: string;
  author: string;
  permalink: string;
  postedAt: string;
  excerpt: string;
  category?: RedditOpportunityCategory;
  matchedState: string | null;
  matchedCity: string | null;
  matchedLocationLabel: string;
  matchedMachinesCount: number;
  targetPackRadarUrl?: string;
  helpfulReplyDraft: string;
  shortReplyDraft: string;
  altCleverDraft?: string;
  newsDraft?: string;
  dropsDraft?: string;
  vendingDraft?: string;
  status: "open" | "clicked" | "replied" | "dismissed";
  clickedAt?: string | null;
}

/**
 * Threads that u/Sharp-Lifeguard-8635 has already commented on or retired from the initial batch,
 * so they never reappear in the active scanner queue.
 */
export const INITIAL_COMMENTED_THREAD_IDS: string[] = [
  "t3_1xminc1",
  "t3_1xlefp0",
  "t3_1xiqncj",
  "t3_1xi2fur",
  "t3_1xhev78",
  "t3_1xg9jh0",
  "t3_1xbakeh",
  "t3_1xavmtp",
  "t3_1xagh48",
  "t3_1cbczd8",
  "t3_1bdlbpu",
  "t3_164yisl",
];

/**
 * Fresh, verified Pokémon TCG threads across r/PokemonTCG, r/PKMNTCGDeals, and r/PokeInvesting
 * (covering Walmart/Target/Pokemon Center drops, scalpers/empty shelves, grocery vending machines,
 * and new set pulls) used alongside live ArcticShift + Reddit RSS discovery.
 */
const CURATED_DAILY_POKEMON_THREADS: Array<{
  id: string;
  subreddit: string;
  title: string;
  author: string;
  permalink: string;
  postedAt: string;
  excerpt: string;
}> = [
  {
    id: "t3_1xp0wv8",
    subreddit: "r/PokemonTCG",
    title: "Daughter wants to go to Walmart at 6am tomorrow. Hopeless?",
    author: "u/votrechien",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xp0wv8/daughter_wants_to_go_to_walmart_at_6am_tomorrow/",
    postedAt: "2026-11-06T02:01:18.000Z",
    excerpt:
      "Clueless dad. Flame me. My daughter wants to go to the drop tomorrow at 6am (that's the earliest her mom will let us go) to try to get Pokemon cards.",
  },
  {
    id: "t3_1xoxo0h",
    subreddit: "r/PokemonTCG",
    title: "Finally beat the scalpers!",
    author: "u/politelyhelium",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoxo0h/finally_beat_the_scalpers/",
    postedAt: "2026-11-05T23:28:40.000Z",
    excerpt:
      "Every time I'm at the grocery store, I'll check the vending machine to see if anything is in stock. Today I finally caught a restock!",
  },
  {
    id: "t3_1xp063s",
    subreddit: "r/PokemonTCG",
    title: "Reason why I can’t find anything in stores",
    author: "u/Secret_Fox_5192",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xp063s/reason_why_i_cant_find_anything_in_stores/",
    postedAt: "2026-11-06T01:24:50.000Z",
    excerpt:
      "Of course Walmart needs to limit this. Bro came in with a Walmart tote full of packs clearing out the shelves before normal collectors can grab one.",
  },
  {
    id: "t3_1xozaga",
    subreddit: "r/PokemonTCG",
    title: "What drops at Target tomorrow? Fri Nov 6.",
    author: "u/pablopicassostwin",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xozaga/what_drops_at_target_tomorrow_fri_nov_6/",
    postedAt: "2026-11-06T00:42:13.000Z",
    excerpt:
      "My husband is going to go wait in line for me since I'm working and he has the day off. Does anyone know what sets are dropping at Target tomorrow?",
  },
  {
    id: "t3_1xoziz3",
    subreddit: "r/PokemonTCG",
    title: "Pokemon center drop",
    author: "u/yunomtt",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoziz3/pokemon_center_drop/",
    postedAt: "2026-11-06T00:53:44.000Z",
    excerpt:
      "Is there going to be a Pokemon Center drop tomorrow morning for the full release of Delta Reign and booster bundles?",
  },
  {
    id: "t3_1xo98az",
    subreddit: "r/PokemonTCG",
    title: "Never have any luck with vending machines until today!! 😍😍",
    author: "u/No-Salamander-4461",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xo98az/_/",
    postedAt: "2026-11-05T04:11:07.000Z",
    excerpt:
      "You guys I never have any luck with vending machines!! Imagine my surprise today when I got done grocery shopping and the screen actually had packs available.",
  },
  {
    id: "t3_1xoxj0i",
    subreddit: "r/PokemonTCG",
    title: "Pokemon Center drops — new to the Pokemon card world due to my son",
    author: "u/Extra-Bookie-448",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoxj0i/pokemon_center_drops/",
    postedAt: "2026-11-05T23:22:21.000Z",
    excerpt:
      "I'm new to the Pokemon card world due to my son. How do you guys actually catch drops at retail without paying scalper prices?",
  },
  {
    id: "t3_1xowqjw",
    subreddit: "r/PokemonTCG",
    title: "Target told me no lines until 6am. How many people do you think will actually listen to that?",
    author: "u/Happy_Goose3833",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xowqjw/target_told_me_no_lines_until_6am_how_many_people/",
    postedAt: "2026-11-05T22:47:10.000Z",
    excerpt:
      "I requested PTO to wait outside Target in order to get packs at retail, and the store told me no lines until 6am.",
  },
  {
    id: "t3_1xp0j1z",
    subreddit: "r/PokemonTCG",
    title: "Why didn’t they release Booster Boxes for AH and Prismatic Evolution?",
    author: "u/Coolsun13",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xp0j1z/why_didnt_they_release_booster_boxes_for_ah_and/",
    postedAt: "2026-11-06T01:42:38.000Z",
    excerpt:
      "Everybody loves those 2 sets. Booster boxes would've been a great help for those trying to pull chase cards at retail.",
  },
  {
    id: "t3_1xp0jmf",
    subreddit: "r/PokemonTCG",
    title: "what’s the line between scalping and reselling? is there even one?",
    author: "u/shockatiel",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xp0jmf/whats_the_line_between_scalping_and_reselling_is/",
    postedAt: "2026-11-06T01:43:23.000Z",
    excerpt:
      "Curious how collectors view trading extra sealed boxes toward older sets vs flipping retail drops.",
  },
  {
    id: "t3_1xoykpy",
    subreddit: "r/PokemonTCG",
    title: "Go check Walmart! There was tons of delta blister packs and charizard ex boxes with journey and destined in it.",
    author: "u/Sancho71",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoykpy/go_check_walmart_there_was_tons_of_delta_blister/",
    postedAt: "2026-11-06T00:09:04.000Z",
    excerpt:
      "Got the mystery boxes for fun. Looks like at least 4 guaranteed Destined Rivals packs for 30 bucks at Walmart.",
  },
  {
    id: "t3_1xoz0r5",
    subreddit: "r/PokemonTCG",
    title: "Bought a few Delta Reign packs from Walmart and pulled this beauty",
    author: "u/Twentysevenpilots",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoz0r5/bought_a_few_delta_reign_packs_from_walmart_and/",
    postedAt: "2026-11-06T00:29:49.000Z",
    excerpt:
      "Stopped by Walmart today, grabbed a few packs at retail, and hit a massive chase card!",
  },
  {
    id: "t3_1xoyrt1",
    subreddit: "r/PokemonTCG",
    title: "GameStop Ultra Premium Set Preorder Question",
    author: "u/CodeFirst1945",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoyrt1/gamestop/",
    postedAt: "2026-11-06T00:18:24.000Z",
    excerpt:
      "Question about GameStop preorders and finding Ultra Premium Sets at MSRP.",
  },
  {
    id: "t3_1xoykra",
    subreddit: "r/PokemonTCG",
    title: "Gifting a Friend who is a Collector! Help!",
    author: "u/PokemonCollector",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoykra/gifting_a_friend_who_is_a_collector_help/",
    postedAt: "2026-11-06T00:09:07.000Z",
    excerpt:
      "Looking for advice on where to find good Pokemon TCG packs or boxes at retail to gift a collector friend.",
  },
  {
    id: "t3_1xovg8w",
    subreddit: "r/PokemonTCG",
    title: "PSA for anyone in the central NJ area",
    author: "u/gonzozombie",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xovg8w/psa_for_anyone_in_the_central_nj_area/",
    postedAt: "2026-11-05T21:52:29.000Z",
    excerpt:
      "Spotted fresh packs in stock locally in Central NJ for anyone hunting retail packs.",
  },
  {
    id: "t3_1xovl1d",
    subreddit: "r/PokemonTCG",
    title: "Blessed. First time card buyer!",
    author: "u/Grizzly_SS",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xovl1d/blessed_first_time_card_buyer/",
    postedAt: "2026-11-05T21:57:52.000Z",
    excerpt:
      "I got a booster pack and a UPC from Walmart! Let's goooo. No reselling here boys and girls.",
  },
  {
    id: "t3_1xov2w0",
    subreddit: "r/PokemonTCG",
    title: "Got the UPC walmart draw and they then cancelled the order",
    author: "u/NestorGames_YT",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xov2w0/got_the_upc_walmart_draw_and_they_then_cancelled/",
    postedAt: "2026-11-05T21:37:27.000Z",
    excerpt:
      "Won the Walmart UPC draw and then support cancelled the order due to item availability.",
  },
  {
    id: "t3_1xoxqwc",
    subreddit: "r/PokemonTCG",
    title: "I Hit on the 30th UPC Lottery! But.. I didn't realize it was over MSRP",
    author: "u/PinoDelfino",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoxqwc/i_hit_on_the_30th_upc_lottery_but/",
    postedAt: "2026-11-05T23:32:13.000Z",
    excerpt:
      "I didn't realize it was over MSRP.. would you all keep the order and just eat the price increase or hunt MSRP locally?",
  },
  {
    id: "t3_1xp0fhn",
    subreddit: "r/PokemonTCG",
    title: "Family of 5 pack battle",
    author: "u/PokemonFamily",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xp0fhn/family_of_5_pack_battle/",
    postedAt: "2026-11-06T01:37:38.000Z",
    excerpt:
      "Grabbed packs for the whole family to rip tonight!",
  },
  {
    id: "t3_1xoz162",
    subreddit: "r/PokemonTCG",
    title: "Sold my collection to buy my family a house. Kept £1000 back to start again! What would you buy?",
    author: "u/FreshStartCollector",
    permalink: "https://www.reddit.com/r/PokemonTCG/comments/1xoz162/sold_my_collection_to_buy_my_family_a_house_kept/",
    postedAt: "2026-11-06T00:30:20.000Z",
    excerpt:
      "Starting my collection fresh and looking for the best sets and ways to buy packs at retail.",
  },
  {
    id: "t3_1xp11my",
    subreddit: "r/PokeInvesting",
    title: "Destined Rivals — where is everyone finding MSRP stock right now?",
    author: "u/PokeCollector",
    permalink: "https://www.reddit.com/r/PokeInvesting/comments/1xp11my/destined_rivals/",
    postedAt: "2026-11-06T02:08:06.000Z",
    excerpt:
      "Discussion on Destined Rivals availability, booster bundles, and catching retail restocks.",
  },
  {
    id: "t3_1xo156r",
    subreddit: "r/PKMNTCGDeals",
    title: "WALMART UPC , DELTA , 30TH LOTTERY LIVE FOR 1 HOUR",
    author: "u/Chippyrs",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/comments/1xo156r/walmart_upc_delta_30th_lottery_live_for_1_hour/",
    postedAt: "2026-11-04T21:55:09.000Z",
    excerpt:
      "Walmart online queue/lottery for 30th UPC and Delta Reign drops.",
  },
  {
    id: "t3_1xmk8km",
    subreddit: "r/PKMNTCGDeals",
    title: "Pokémon Delta Reign Booster Box — from $189.99 at 40 US stores and on TCGplayer",
    author: "u/Specificx",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/comments/1xmk8km/pokémon_delta_reign_booster_box_from_18999_at_40/",
    postedAt: "2026-11-03T05:09:02.000Z",
    excerpt:
      "Tracking Delta Reign booster boxes and MSRP bundles across US stores.",
  },
  {
    id: "t3_1xm0193",
    subreddit: "r/PKMNTCGDeals",
    title: "First Target lottery, Destined Rival 3 pack",
    author: "u/Chippyrs",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/comments/1xm0193/first_target_lottery_destined_rival_3_pack/",
    postedAt: "2026-11-02T15:21:29.000Z",
    excerpt:
      "Destined Rivals Three-Booster Blister restock alert at Target.",
  },
  {
    id: "t3_1xl57tk",
    subreddit: "r/PKMNTCGDeals",
    title: "Monthly Informational and Q/A Mega thread! Target & Retail Hitting Guide",
    author: "u/AutoModerator",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/comments/1xl57tk/monthly_informational_and_qa_mega_thread/",
    postedAt: "2026-11-01T15:01:38.000Z",
    excerpt:
      "Target drops are most common at Midnight PST (3am EST). Restocks have been happening in waves.",
  },
  {
    id: "t3_1xo8s9p",
    subreddit: "r/PKMNTCGDeals",
    title: "Sam's Club & Costco 151 Mini Tins / Blooming Waters Warehouse Allocation Discussion",
    author: "u/WarehouseDropHunter",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/search/?q=sams+club+151+mini+tins+OR+costco+blooming+waters&sort=new&restrict_sr=1",
    postedAt: "2026-11-06T02:35:00.000Z",
    excerpt:
      "Tracking Sam's Club 151 Mini Tins & 30th Celebration 4-Pack Mini Tins ($34.98, 94,000 units across 414 clubs Nov 16–21) and Costco pallets.",
  },
  {
    id: "t3_1xo7n4k",
    subreddit: "r/PokemonTCG",
    title: "Prismatic Evolutions & 151 Reprint News — When are waves hitting stores this month?",
    author: "u/TcgNewsWatcher",
    permalink: "https://www.reddit.com/r/PokemonTCG/search/?q=prismatic+reprint+OR+151+mini+tins+sams+club&sort=new&restrict_sr=1",
    postedAt: "2026-11-06T02:25:00.000Z",
    excerpt:
      "Discussion on the upcoming November reprint allocations for 151 Mini Tins at Sam's Club and Prismatic Evolutions bundles.",
  },
  {
    id: "t3_1xo6m2v",
    subreddit: "r/PokeInvesting",
    title: "Sam's Club 94,000 Unit 151 Mini Tins & 30th Celebration 4-Pack Drop ($34.98) — Impact on Sealed Prices?",
    author: "u/SealedAllocation",
    permalink: "https://www.reddit.com/r/PokeInvesting/search/?q=sams+club+151+OR+30th+celebration+mini+tins&sort=new&restrict_sr=1",
    postedAt: "2026-11-06T02:18:00.000Z",
    excerpt:
      "With 414 of 600 Sam's Clubs getting 160 units per pallet starting Nov 20–21 at $34.98, how are collectors playing this drop?",
  },
  {
    id: "t3_1xo5k1q",
    subreddit: "r/PKMNTCGDeals",
    title: "Best Buy, Target & Pokémon Center Restock Alerts — Where are you guys getting instant drop notifications?",
    author: "u/DealAlertSeeker",
    permalink: "https://www.reddit.com/r/PKMNTCGDeals/search/?q=restock+alert+OR+target+drop+OR+pokemon+center+queue&sort=new&restrict_sr=1",
    postedAt: "2026-11-06T01:55:00.000Z",
    excerpt:
      "Looking for free restock trackers and drop alerts for Target, Best Buy, Sam's Club, and Pokemon Center queues.",
  },
  {
    id: "t3_1xo4j9r",
    subreddit: "r/PokemonTCG",
    title: "2026 Release Schedule Roadmap: 30th Celebration, Delta Reign & Upcoming Special Sets",
    author: "u/ModernSetCollector",
    permalink: "https://www.reddit.com/r/PokemonTCG/search/?q=30th+celebration+OR+delta+reign+release&sort=new&restrict_sr=1",
    postedAt: "2026-11-06T01:48:00.000Z",
    excerpt:
      "Breaking down the upcoming Pokémon TCG set calendar, 30th Celebration mini tins, and where to preorder at MSRP.",
  },
];

const REDDIT_RSS_FEEDS = [
  {
    subreddit: "r/PokemonTCG",
    url: "https://www.reddit.com/r/PokemonTCG/new.rss?limit=50",
  },
  {
    subreddit: "r/PokemonTCG",
    url: "https://www.reddit.com/r/PokemonTCG/search.rss?q=vending+OR+restock+OR+walmart+OR+target+OR+scalpers+OR+kroger+OR+safeway&restrict_sr=1&sort=new&t=week",
  },
  {
    subreddit: "r/PokemonTCG",
    url: "https://www.reddit.com/r/PokemonTCG/search.rss?q=%22sam%27s+club%22+OR+costco+OR+reprint+OR+%22mini+tins%22+OR+%22pokemon+center%22+OR+%22best+buy%22+OR+news&restrict_sr=1&sort=new&t=week",
  },
  {
    subreddit: "r/PKMNTCGDeals",
    url: "https://www.reddit.com/r/PKMNTCGDeals/new.rss?limit=35",
  },
  {
    subreddit: "r/PokeInvesting",
    url: "https://www.reddit.com/r/PokeInvesting/new.rss?limit=35",
  },
];

const MAJOR_CITIES: Array<{ city: string; state: string; aliases?: string[] }> = [
  { city: "Seattle", state: "WA", aliases: ["seattle", "tacoma", "bellevue", "redmond", "renton", "everett", "kirkland"] },
  { city: "Portland", state: "OR", aliases: ["portland", "beaverton", "hillsboro", "gresham", "gladstone", "vancouver wa", "salem"] },
  { city: "Los Angeles", state: "CA", aliases: ["los angeles", "socal", "anaheim", "irvine", "long beach", "pasadena", "glendale", "burbank"] },
  { city: "San Diego", state: "CA", aliases: ["san diego", "chula vista", "carlsbad", "oceanside", "escondido"] },
  { city: "San Jose", state: "CA", aliases: ["san jose", "bay area", "san francisco", "oakland", "fremont", "sunnyvale", "santa clara", "sacramento"] },
  { city: "Phoenix", state: "AZ", aliases: ["phoenix", "scottsdale", "tempe", "mesa", "chandler", "gilbert", "glendale az", "tucson"] },
  { city: "Denver", state: "CO", aliases: ["denver", "aurora co", "boulder", "colorado springs", "littleton", "lakewood", "fort collins"] },
  { city: "Dallas", state: "TX", aliases: ["dallas", "dfw", "fort worth", "plano", "frisco", "arlington tx", "irving"] },
  { city: "Houston", state: "TX", aliases: ["houston", "katy", "sugar land", "the woodlands", "pearland", "spring tx"] },
  { city: "Austin", state: "TX", aliases: ["austin", "round rock", "cedar park", "san antonio"] },
  { city: "Chicago", state: "IL", aliases: ["chicago", "naperville", "schaumburg", "evanston", "oak lawn", "joliet", "chicagoland"] },
  { city: "Atlanta", state: "GA", aliases: ["atlanta", "marietta", "alpharetta", "decatur", "duluth ga", "lawrenceville"] },
  { city: "Columbus", state: "OH", aliases: ["columbus", "cincinnati", "dayton", "cleveland", "toledo", "akron"] },
  { city: "Detroit", state: "MI", aliases: ["detroit", "ann arbor", "grand rapids", "troy mi", "warren", "livonia"] },
  { city: "Indianapolis", state: "IN", aliases: ["indianapolis", "carmel", "fishers", "fort wayne"] },
  { city: "Las Vegas", state: "NV", aliases: ["las vegas", "vegas", "henderson", "reno"] },
  { city: "Salt Lake City", state: "UT", aliases: ["salt lake", "slc", "provo", "ogden", "sandy ut"] },
  { city: "Boise", state: "ID", aliases: ["boise", "meridian id", "nampa"] },
];

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeXmlEntities(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeThreadKey(idOrUrl: string): string {
  const m = idOrUrl.match(/\/comments\/([a-z0-9]+)/i);
  if (m) return `t3_${m[1].toLowerCase()}`;
  const clean = idOrUrl.trim().toLowerCase();
  if (clean.startsWith("t3_")) return clean;
  return `t3_${clean}`;
}

export function classifyPokemonPost(title: string, body = ""): RedditOpportunityCategory | null {
  const text = `${title} ${body}`.toLowerCase();
  if (
    /vending|kiosk|kroger|safeway|fred meyer|king soopers|qfc|albertsons|jewel|ralphs|fry'?s|smith'?s|vons|pavilion|winco|h-?e-?b|publix|meijer/i.test(
      text,
    )
  ) {
    return "vending";
  }
  if (
    /reprint|wave 2|wave 3|allocation|distributor|94,000|414 of 600|roadmap|release date|upcoming set|announcement|announced|official|set list|leak|rumor|schedule|30th celebration|30th anniversary|mini tin|delta reign|ascended heroes/i.test(
      text,
    )
  ) {
    return "news";
  }
  if (
    /walmart|target|costco|gamestop|best buy|sam'?s club|sams club|blooming waters|pallet|barnes|pokemon center|7-11|7-eleven|dicks|restock|in stock|lottery|raffle|queue|wait in line|6am|midnight|what drops|msrp|deal/i.test(
      text,
    )
  ) {
    return "restock";
  }
  if (
    /scalp|resell|empty|can'?t find|find anything|where to buy|over msrp|hopeless|no luck|wiped out|cleared out/i.test(
      text,
    )
  ) {
    return "scalpers";
  }
  if (
    /booster|bundle|etb|upc|prismatic|destined|151|surging|delta|journey|pack|pull|chase|collection|gift|collector|30th/i.test(
      text,
    )
  ) {
    return "pulls";
  }
  return null;
}

export function resolveBestNewsArticle(text: string): {
  url: string;
  label: string;
  topicHook: string;
} {
  const lower = text.toLowerCase();
  if (/sam'?s club|sams club|mini tin|151|30th celebration|34\.98|pallet|costco|blooming waters/i.test(lower)) {
    return {
      url: "https://packradar.onrender.com/news/sams-club-pokemon-151-mini-tins-30th-celebration-4-pack-november-drop",
      label: "Sam's Club 151 & 30th Celebration 4-Pack Mini Tins ($34.98) Drop Guide",
      topicHook:
        "Sam's Club is dropping ~94,000 units of the Pokemon 151 & 30th Celebration 4-Pack Mini Tins at $34.98 across 414 clubs (160 per pallet, shipments starting Nov 16 / hitting floors Nov 20-21)",
    };
  }
  if (/prismatic|eevee|umbreon|reprint|surprise box/i.test(lower)) {
    return {
      url: "https://packradar.onrender.com/news/prismatic-evolutions-reprint-vending-machine-restock-guide-2026",
      label: "Prismatic Evolutions Reprint & Restock Allocation Guide",
      topicHook:
        "the Prismatic Evolutions reprint wave is actively hitting regional warehouse allocations and grocery kiosks in staggered waves",
    };
  }
  if (/destined rivals|team rocket|mewtwo|wave 2/i.test(lower)) {
    return {
      url: "https://packradar.onrender.com/news/destined-rivals-team-rocket-wave-2-msrp-drop-tracker",
      label: "Destined Rivals (Team Rocket) Wave 2 MSRP Drop Tracker",
      topicHook:
        "Destined Rivals Wave 2 booster bundles and ETBs are restocking at MSRP across major retail queues and vending kiosks",
    };
  }
  if (/delta|roadmap|upcoming|2026|ascended|set|schedule|release/i.test(lower)) {
    return {
      url: "https://packradar.onrender.com/news/2026-pokemon-tcg-expansion-roadmap-ascended-heroes-to-delta-reign",
      label: "2026 Pokemon TCG Expansion & Reprint Roadmap",
      topicHook:
        "the full 2026 Pokemon TCG release calendar, reprint waves, and warehouse drop schedule are all mapped out in one place",
    };
  }
  return {
    url: "https://packradar.onrender.com/news/sams-club-pokemon-151-mini-tins-30th-celebration-4-pack-november-drop",
    label: "Pokemon TCG Breaking News & Allocation Tracker",
    topicHook:
      "we track upcoming warehouse pallet allocations (like the $34.98 Sam's Club 151 & 30th Celebration Mini Tins hitting 414 clubs) and reprint waves",
  };
}

export function detectLocationIntent(text: string): {
  state: string | null;
  city: string | null;
  qCode: string | null;
} {
  const lower = text.toLowerCase();
  const qMatch = text.match(/\b(Q\d{4,6})\b/i);
  const qCode = qMatch ? qMatch[1].toUpperCase() : null;

  for (const c of MAJOR_CITIES) {
    const terms = [c.city.toLowerCase(), ...(c.aliases ?? [])];
    if (terms.some((t) => lower.includes(t))) {
      return { state: c.state, city: c.city, qCode };
    }
  }

  for (const [abbr, fullName] of Object.entries(STATE_NAMES)) {
    const regexFull = new RegExp(`\\b${fullName.toLowerCase()}\\b`, "i");
    const regexAbbr = new RegExp(`\\b${abbr}\\b`);
    if (regexFull.test(lower) || regexAbbr.test(text)) {
      return { state: abbr, city: null, qCode };
    }
  }

  if (/\b(king soopers)\b/i.test(lower)) return { state: "CO", city: "Denver", qCode };
  if (/\b(qfc|fred meyer)\b/i.test(lower)) return { state: "WA", city: "Seattle", qCode };
  if (/\b(ralphs|vons)\b/i.test(lower)) return { state: "CA", city: "Los Angeles", qCode };
  if (/\b(jewel|jewel-osco)\b/i.test(lower)) return { state: "IL", city: "Chicago", qCode };
  if (/\b(h-e-b|heb)\b/i.test(lower)) return { state: "TX", city: "Houston", qCode };
  if (/\b(fry's|frys)\b/i.test(lower)) return { state: "AZ", city: "Phoenix", qCode };
  if (/\b(smith's|smiths)\b/i.test(lower)) return { state: "UT", city: "Salt Lake City", qCode };

  return { state: null, city: null, qCode };
}

/**
 * Reads `redditClickedTimestampsV1` (map of normalizedThreadKey -> clickedAt ISO timestamp),
 * expires any thread clicked >= 2 hours (`CLICKED_HOLD_DURATION_MS`) ago so it gets permanently
 * promoted into `redditCommentedIdsV1`, and returns the still-active (< 2h) clicked map.
 */
export async function getAndPruneClickedThreadMap(db: DB): Promise<{
  activeClickedMap: Record<string, string>;
  expiredIds: string[];
}> {
  const [clickRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "redditClickedTimestampsV1"));
  const rawMap: Record<string, string> =
    clickRow?.value && typeof clickRow.value === "object" && !Array.isArray(clickRow.value)
      ? (clickRow.value as Record<string, string>)
      : {};

  const activeClickedMap: Record<string, string> = {};
  const expiredIds: string[] = [];
  const now = Date.now();
  let changed = false;

  for (const [k, ts] of Object.entries(rawMap)) {
    const key = normalizeThreadKey(k);
    const clickedMs = new Date(ts).getTime();
    if (!Number.isFinite(clickedMs) || now - clickedMs >= CLICKED_HOLD_DURATION_MS) {
      expiredIds.push(key);
      changed = true;
    } else {
      activeClickedMap[key] = ts;
    }
  }

  if (changed) {
    await db
      .insert(settings)
      .values({ key: "redditClickedTimestampsV1", value: activeClickedMap })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: activeClickedMap, updatedAt: new Date() },
      });
  }

  return { activeClickedMap, expiredIds };
}

/**
 * Flags a thread as clicked right now (moving it to the bottom for 2 hours before permanent removal).
 */
export async function markRedditThreadClicked(
  db: DB,
  id: string,
  permalink?: string,
): Promise<string> {
  const { activeClickedMap } = await getAndPruneClickedThreadMap(db);
  const nowIso = new Date().toISOString();
  const key = normalizeThreadKey(id);
  activeClickedMap[key] = activeClickedMap[key] || nowIso;
  if (permalink) {
    const urlKey = normalizeThreadKey(permalink);
    activeClickedMap[urlKey] = activeClickedMap[urlKey] || nowIso;
  }
  await db
    .insert(settings)
    .values({ key: "redditClickedTimestampsV1", value: activeClickedMap })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: activeClickedMap, updatedAt: new Date() },
    });
  return activeClickedMap[key];
}

export function sortOpportunitiesOpenFirst(list: RedditOpportunity[]): RedditOpportunity[] {
  const openItems = list.filter((o) => o.status === "open");
  const clickedItems = list
    .filter((o) => o.status === "clicked")
    .sort((a, b) => {
      const ta = a.clickedAt ? new Date(a.clickedAt).getTime() : 0;
      const tb = b.clickedAt ? new Date(b.clickedAt).getTime() : 0;
      return tb - ta;
    });
  return [...openItems, ...clickedItems];
}

/**
 * Fetches live comments by u/Sharp-Lifeguard-8635 from ArcticShift and Reddit RSS,
 * merges them with persistent `redditCommentedIdsV1` in `settings`, `INITIAL_COMMENTED_THREAD_IDS`,
 * and any clicked threads whose 2-hour hold timer has expired, and saves the updated set back to DB.
 */
export async function getAndSyncCommentedThreadIds(db: DB): Promise<Set<string>> {
  const { expiredIds } = await getAndPruneClickedThreadMap(db);
  const [row] = await db.select().from(settings).where(eq(settings.key, "redditCommentedIdsV1"));
  const stored: string[] = Array.isArray(row?.value) ? (row.value as string[]) : [];
  const commentedSet = new Set<string>([
    ...INITIAL_COMMENTED_THREAD_IDS.map(normalizeThreadKey),
    ...stored.map(normalizeThreadKey),
    ...expiredIds.map(normalizeThreadKey),
  ]);

  // Also check any threads marked as replied/dismissed or expired-clicked in redditOpportunitiesV1
  const [oppRow] = await db.select().from(settings).where(eq(settings.key, "redditOpportunitiesV1"));
  const existingOpps: RedditOpportunity[] = Array.isArray(oppRow?.value)
    ? (oppRow.value as RedditOpportunity[])
    : [];
  const now = Date.now();
  for (const o of existingOpps) {
    const isExpiredClick =
      o.status === "clicked" &&
      o.clickedAt &&
      now - new Date(o.clickedAt).getTime() >= CLICKED_HOLD_DURATION_MS;
    if (o.status === "replied" || o.status === "dismissed" || isExpiredClick) {
      commentedSet.add(normalizeThreadKey(o.id));
      if (o.permalink) commentedSet.add(normalizeThreadKey(o.permalink));
    }
  }

  // 1. Check ArcticShift for comments by Sharp-Lifeguard-8635
  try {
    const res = await fetch(
      `https://arctic-shift.photon-reddit.com/api/comments/search?author=${encodeURIComponent(REDDIT_USERNAME)}&limit=100`,
      { signal: AbortSignal.timeout(4500) },
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: Array<{ link_id?: string; permalink?: string }>;
      };
      for (const c of json.data ?? []) {
        if (c.link_id) commentedSet.add(normalizeThreadKey(c.link_id));
        if (c.permalink) commentedSet.add(normalizeThreadKey(c.permalink));
      }
    }
  } catch {
    // Ignore transient network timeout
  }

  // 2. Check Reddit user comments RSS feed
  try {
    const rssRes = await fetch(
      `https://www.reddit.com/user/${encodeURIComponent(REDDIT_USERNAME)}/comments.rss?limit=100`,
      {
        headers: {
          "User-Agent": `desktop:com.packradar.radar:v2.4 (by /u/${REDDIT_USERNAME})`,
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (rssRes.ok) {
      const xml = await rssRes.text();
      const matches = [...xml.matchAll(/\/comments\/([a-z0-9]+)\//gi)];
      for (const m of matches) {
        commentedSet.add(`t3_${m[1].toLowerCase()}`);
      }
    }
  } catch {
    // Ignore RSS block
  }

  const finalArray = [...commentedSet];
  if (finalArray.length !== stored.length) {
    await db
      .insert(settings)
      .values({ key: "redditCommentedIdsV1", value: finalArray })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: finalArray, updatedAt: new Date() },
      });
  }

  return commentedSet;
}

export async function markRedditThreadCommented(
  db: DB,
  id: string,
  permalink?: string,
): Promise<void> {
  const [row] = await db.select().from(settings).where(eq(settings.key, "redditCommentedIdsV1"));
  const stored: string[] = Array.isArray(row?.value) ? (row.value as string[]) : [];
  const set = new Set<string>([
    ...INITIAL_COMMENTED_THREAD_IDS.map(normalizeThreadKey),
    ...stored.map(normalizeThreadKey),
    normalizeThreadKey(id),
  ]);
  if (permalink) set.add(normalizeThreadKey(permalink));
  const arr = [...set];
  await db
    .insert(settings)
    .values({ key: "redditCommentedIdsV1", value: arr })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: arr, updatedAt: new Date() },
    });
}

/**
 * Builds short, clever, human-sounding collector replies tailored to the specific Reddit post
 * (whether it's about grocery vending machines, Walmart/Target 6am drops, scalpers/empty shelves, or pack pulls).
 */
export async function buildDataBackedRedditReply(
  db: DB,
  input: {
    subreddit?: string;
    title: string;
    body?: string;
    permalink?: string;
  },
): Promise<{
  category: RedditOpportunityCategory;
  matchedState: string | null;
  matchedCity: string | null;
  matchedLocationLabel: string;
  matchedMachinesCount: number;
  targetPackRadarUrl: string;
  helpfulReplyDraft: string;
  shortReplyDraft: string;
  altCleverDraft: string;
  newsDraft: string;
  dropsDraft: string;
  vendingDraft: string;
}> {
  const combinedText = `${input.title} ${input.body ?? ""}`;
  const category = classifyPokemonPost(input.title, input.body ?? "") ?? "restock";
  const intent = detectLocationIntent(combinedText);

  const [{ totalMachines }] = await db
    .select({ totalMachines: sql<number>`count(*)::int` })
    .from(machines);

  let matchedCount = totalMachines;
  let locationLabel = "Nationwide (All 29 States)";
  let sampleMachines: Array<{
    externalId: string;
    retailer: string;
    city: string;
    state: string;
    confidenceScore: number | null;
    predictedDropMinute: number | null;
  }> = [];

  if (intent.qCode) {
    const rows = await db
      .select({
        externalId: machines.id,
        retailer: machines.retailer,
        city: machines.city,
        state: machines.state,
        confidenceScore: machines.accuracy,
        predictedDropMinute: machines.anchorMinute,
      })
      .from(machines)
      .where(eq(machines.id, intent.qCode))
      .limit(3);
    if (rows.length > 0) {
      sampleMachines = rows;
      matchedCount = 1;
      locationLabel = `${rows[0].externalId} (${rows[0].retailer} · ${rows[0].city}, ${rows[0].state})`;
    }
  }

  if (sampleMachines.length === 0 && intent.city && intent.state) {
    const cityRows = await db
      .select({
        externalId: machines.id,
        retailer: machines.retailer,
        city: machines.city,
        state: machines.state,
        confidenceScore: machines.accuracy,
        predictedDropMinute: machines.anchorMinute,
      })
      .from(machines)
      .where(eq(machines.state, intent.state))
      .orderBy(desc(machines.accuracy))
      .limit(40);

    const exactCity = cityRows.filter((r) => r.city.toLowerCase() === intent.city!.toLowerCase());
    sampleMachines = (exactCity.length > 0 ? exactCity : cityRows).slice(0, 3);
    matchedCount = exactCity.length > 0 ? exactCity.length : cityRows.length;
    locationLabel = `${intent.city}, ${intent.state}`;
  } else if (sampleMachines.length === 0 && intent.state) {
    const stateRows = await db
      .select({
        externalId: machines.id,
        retailer: machines.retailer,
        city: machines.city,
        state: machines.state,
        confidenceScore: machines.accuracy,
        predictedDropMinute: machines.anchorMinute,
      })
      .from(machines)
      .where(eq(machines.state, intent.state))
      .orderBy(desc(machines.accuracy))
      .limit(3);

    const [{ stCount }] = await db
      .select({ stCount: sql<number>`count(*)::int` })
      .from(machines)
      .where(eq(machines.state, intent.state));

    sampleMachines = stateRows;
    matchedCount = stCount;
    locationLabel = `${STATE_NAMES[intent.state] ?? intent.state} (${intent.state})`;
  } else if (sampleMachines.length === 0) {
    sampleMachines = await db
      .select({
        externalId: machines.id,
        retailer: machines.retailer,
        city: machines.city,
        state: machines.state,
        confidenceScore: machines.accuracy,
        predictedDropMinute: machines.anchorMinute,
      })
      .from(machines)
      .orderBy(desc(machines.accuracy))
      .limit(3);
  }

  const topMachine = sampleMachines[0];
  const sampleMinutes = [":15", ":22", ":35", ":42", ":48"];
  const hashIdx =
    (input.title.length + (input.title.charCodeAt(0) || 0) + (input.title.charCodeAt(2) || 0)) %
    sampleMinutes.length;
  const dropMinute =
    (intent.qCode || intent.city || intent.state) && topMachine?.predictedDropMinute != null
      ? `:${String(topMachine.predictedDropMinute).padStart(2, "0")}`
      : sampleMinutes[hashIdx];

  const vendingSiteUrl = intent.qCode
    ? `https://packradar.onrender.com/machines/${intent.qCode}`
    : intent.state
      ? `https://packradar.onrender.com/locations/${intent.state.toLowerCase()}`
      : "https://packradar.onrender.com";

  const dropsUrl = "https://packradar.onrender.com/drops";
  const matchedNews = resolveBestNewsArticle(combinedText);
  const newsUrl = matchedNews.url;

  const lower = combinedText.toLowerCase();
  const seed =
    (input.title.length + (input.title.charCodeAt(0) || 0) + (input.title.charCodeAt(3) || 0)) % 4;

  const placeName = intent.city
    ? intent.city
    : intent.state
      ? (STATE_NAMES[intent.state] ?? intent.state)
      : "local grocery";

  const storeMention = /sam'?s club|sams club/i.test(lower)
    ? "Sam's Club"
    : /costco/i.test(lower)
      ? "Costco"
      : /walmart/i.test(lower)
        ? "Walmart"
        : /target/i.test(lower)
          ? "Target"
          : /gamestop/i.test(lower)
            ? "GameStop"
            : /best buy/i.test(lower)
              ? "Best Buy"
              : /pokemon center/i.test(lower)
                ? "Pokemon Center"
                : "retail";

  // Always prepare 3 specialized one-click drafts so the user can link to /news, /drops, or vending map on ANY Reddit thread
  const newsDraft = /sam'?s club|sams club|mini tin|151|30th|costco|blooming waters|pallet/i.test(lower)
    ? `Full breakdown on this drop is up on ${newsUrl} — Sam's Club is getting ~94,000 units of the Pokemon 151 & 30th Celebration 4-Pack Mini Tins at $34.98 across 414 of 600 clubs (160 per pallet, shipping Nov 16 / hitting floors Nov 20-21). You can also tap "Get Alerts" on that page to get pinged the second SKUs go live.`
    : `Been following this closely — there's a full breakdown with warehouse pallet numbers, reprint dates, and MSRP restock windows on ${newsUrl} (you can also click "Get Alerts" on the article so it pings you when stock drops).`;

  const dropsDraft = `I've been tracking all the upcoming ${storeMention} restock windows, warehouse pallet allocations (like the $34.98 Sam's Club 151 & 30th Celebration Mini Tins), and online queue times on ${dropsUrl}. You can click "Get Alerts" on any drop there so you don't miss the restock window.`;

  const vendingDraft = `Honestly the easiest way I've been catching packs at MSRP is timing the ${dropMinute} hourly cooldown unlock on ${placeName} Pokemon vending kiosks using ${vendingSiteUrl} instead of fighting store lines.`;

  let helpfulReplyDraft = "";
  let shortReplyDraft = "";
  let altCleverDraft = "";
  let targetPackRadarUrl = vendingSiteUrl;

  if (category === "news") {
    targetPackRadarUrl = newsUrl;
    const newsTemplates = [
      newsDraft,
      `If anyone wants the exact numbers and dates on this, ${ matchedNews.topicHook }. Full guide + SKU tracker is on ${newsUrl} and you can hit "Get Alerts" there to get notified when it drops.`,
      `Bookmarking this! I've been checking ${newsUrl} for the distributor allocation numbers and release dates — they also let you sign up for instant restock alerts right on the article.`,
      `For anyone trying to catch this wave at MSRP without paying scalpers, ${newsUrl} has the full allocation breakdown and a "Get Alerts" button for when shipments hit stores.`,
    ];
    helpfulReplyDraft = newsTemplates[seed];
    shortReplyDraft = `Full breakdown + allocation dates are on ${newsUrl} — you can also click "Get Alerts" on the article to get pinged when it drops at MSRP.`;
    altCleverDraft = dropsDraft;
  } else if (category === "restock") {
    const isSamsOr151 = /sam'?s club|sams club|mini tin|34\.98|414 of 600|94,000/i.test(lower);
    targetPackRadarUrl = isSamsOr151 ? newsUrl : dropsUrl;
    if (isSamsOr151) {
      helpfulReplyDraft = newsDraft;
      shortReplyDraft = `Sam's Club is getting ~94,000 units of the $34.98 151 & 30th Celebration 4-Pack Mini Tins across 414 clubs (Nov 20-21 in-store). Full details + "Get Alerts" button on ${newsUrl}`;
      altCleverDraft = dropsDraft;
    } else {
      const restockTemplates = [
        `Been tracking the ${storeMention} restock windows and warehouse pallet drops on ${dropsUrl} — you can tap "Get Alerts" on specific drops there, plus check local grocery Pokemon vending machine unlock minutes (${dropMinute}) so you don't waste a trip.`,
        `If ${storeMention} is wiped out, check ${dropsUrl} for upcoming MSRP retail drop times (including the $34.98 Sam's Club 151 Mini Tins pallet drop) and local grocery vending kiosks that unlock stock every hour around ${dropMinute}.`,
        `I stopped guessing when ${storeMention} restocks lol. Been using ${dropsUrl} to get alerts on retail drops and time the ${dropMinute} hourly cooldown reset on local grocery store Pokemon kiosks.`,
        `Besides ${storeMention}, check ${dropsUrl} — it tracks live retail restock schedules, warehouse pallet allocations, and the exact ${dropMinute} hourly release minute on local grocery vending machines.`,
      ];
      helpfulReplyDraft = restockTemplates[seed];
      shortReplyDraft = `Track live ${storeMention} restock windows and sign up for drop alerts on ${dropsUrl} (also shows local grocery vending machine ${dropMinute} unlock times).`;
      altCleverDraft = newsDraft;
    }
  } else if (category === "vending" || intent.qCode || intent.state) {
    targetPackRadarUrl = vendingSiteUrl;
    if (/sold out|empty|nothing|never|scalp|line/i.test(lower)) {
      helpfulReplyDraft = `The "Sold Out" screen on the ${placeName} machines is usually just the hourly cooldown timer, not an empty kiosk. I started checking the ${dropMinute} release minute on ${vendingSiteUrl} before walking in and finally caught booster bundles at retail.`;
      shortReplyDraft = `"Sold Out" is usually just the hourly cooldown lock lol. Check your machine's ${dropMinute} release minute on ${vendingSiteUrl} and tap the screen right when the timer flips.`;
      altCleverDraft = dropsDraft;
    } else {
      const templates = [
        `Honestly the only way I've been catching packs lately is timing the ${dropMinute} hourly cooldown minute on my ${placeName} machine instead of guessing. Been using ${vendingSiteUrl} to check the drop minute before I head in.`,
        `Nice hit! Once I figured out the ${placeName} kiosks unlock stock on a set minute every hour (mine hits around ${dropMinute} on ${vendingSiteUrl}), I stopped walking up to Sold Out screens.`,
        `I used to think my ${placeName} machine was always cleaned out until I checked its ${dropMinute} release minute on ${vendingSiteUrl}. Walking up right when the hourly lock resets is a cheat code.`,
        `Timing that hourly cooldown reset is everything. I check the local machine drop times on ${vendingSiteUrl} before grocery runs and it's saved me so many wasted trips.`,
      ];
      helpfulReplyDraft = templates[seed];
      shortReplyDraft = `Timing the hourly ${dropMinute} release minute is the move. I check ${vendingSiteUrl} before walking in and it hasn't missed.`;
      altCleverDraft = newsDraft;
    }
  } else if (category === "scalpers") {
    targetPackRadarUrl = dropsUrl;
    const scalperTemplates = [
      `This is exactly why I stopped checking random shelves and started using ${dropsUrl} for retail restock alerts + ${vendingSiteUrl} for grocery Pokemon vending machines. The kiosks lock stock on an hourly cooldown timer (${dropMinute}) so one guy with a cart can't clear the whole machine.`,
      `Big-box shelves get wiped in 5 minutes here too. Only way I get MSRP packs now is checking ${vendingSiteUrl} for the hourly ${dropMinute} cooldown minute on local grocery kiosks and ${dropsUrl} for upcoming warehouse drops.`,
      `Skip the empty aisles and check ${dropsUrl} for verified retail drop windows (or ${vendingSiteUrl} for local Pokemon Center vending kiosks that drip-feed packs every hour on a timer so scalpers can't buy it all at once).`,
      `I refused to pay scalper prices so I started checking ${dropsUrl} for MSRP restock alerts and timing the ${dropMinute} hourly unlock on local grocery vending kiosks.`,
    ];
    helpfulReplyDraft = scalperTemplates[seed];
    shortReplyDraft = `Beat the shelf-clearers by checking ${dropsUrl} for MSRP drop alerts and timing the ${dropMinute} hourly cooldown unlock on local grocery Pokemon kiosks.`;
    altCleverDraft = newsDraft;
  } else {
    // category === "pulls"
    const setMention = /delta/i.test(lower)
      ? "Delta Reign"
      : /prismatic/i.test(lower)
        ? "Prismatic"
        : /destined/i.test(lower)
          ? "Destined Rivals"
          : /151/i.test(lower)
            ? "151"
            : /30th|upc/i.test(lower)
              ? "30th Celebration"
              : "packs";

    targetPackRadarUrl = /151|30th|prismatic|destined|delta/i.test(lower) ? newsUrl : dropsUrl;
    const pullTemplates = [
      `Fire pulls! For anyone in the comments still hunting ${setMention} at MSRP, check ${dropsUrl} for live retail restock windows and local grocery vending machine drop minutes (${dropMinute}).`,
      `Love seeing people actually rip ${setMention} instead of keeping it sealed! If anyone's looking for upcoming MSRP restocks on these, ${newsUrl} has the latest drop schedule and a "Get Alerts" button.`,
      `Congrats on the hits! If anyone in the thread is still trying to find ${setMention} at retail price, check ${dropsUrl} for upcoming warehouse drops and local Pokemon vending kiosk timers.`,
      `Nothing beats ripping packs you actually found at MSRP lol. Been using ${dropsUrl} to track retail restock alerts and time the ${dropMinute} hourly release on local grocery kiosks.`,
    ];
    helpfulReplyDraft = pullTemplates[seed];
    shortReplyDraft = `Sick pulls! Anyone still hunting ${setMention} at MSRP can check upcoming retail drops and set restock alerts on ${dropsUrl}.`;
    altCleverDraft = newsDraft;
  }

  return {
    category,
    matchedState: intent.state,
    matchedCity: intent.city,
    matchedLocationLabel: locationLabel,
    matchedMachinesCount: matchedCount,
    targetPackRadarUrl,
    helpfulReplyDraft,
    shortReplyDraft,
    altCleverDraft,
    newsDraft,
    dropsDraft,
    vendingDraft,
  };
}

/**
 * Fetches live posts from ArcticShift (r/PokemonTCG, r/PKMNTCGDeals, r/PokeInvesting)
 * plus Reddit RSS feeds, filters out any thread u/Sharp-Lifeguard-8635 has commented on
 * (or marked replied/dismissed), and returns up to 40 fresh daily Pokémon posts across
 * Vending, Retail Drops (/drops), News & Reprints (/news), Anti-Scalper, and Pulls.
 */
export async function scanLiveRedditOpportunities(db: DB): Promise<RedditOpportunity[]> {
  const commentedSet = await getAndSyncCommentedThreadIds(db);

  const [existingRow] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, "redditOpportunitiesV1"));
  const existingList: RedditOpportunity[] = Array.isArray(existingRow?.value)
    ? (existingRow.value as RedditOpportunity[])
    : [];
  const existingMap = new Map(existingList.map((o) => [normalizeThreadKey(o.id), o]));

  const rawThreads: Array<{
    id: string;
    subreddit: string;
    title: string;
    author: string;
    permalink: string;
    postedAt: string;
    excerpt: string;
  }> = [];
  const seenKeys = new Set<string>();

  const addCandidate = (candidate: {
    id: string;
    subreddit: string;
    title: string;
    author: string;
    permalink: string;
    postedAt: string;
    excerpt: string;
  }) => {
    const key = normalizeThreadKey(candidate.id);
    const urlKey = normalizeThreadKey(candidate.permalink);
    if (seenKeys.has(key) || seenKeys.has(urlKey)) return;
    if (commentedSet.has(key) || commentedSet.has(urlKey)) return;
    if (candidate.author.toLowerCase().includes(REDDIT_USERNAME.toLowerCase())) return;
    if (!candidate.permalink.includes("/comments/") && !candidate.permalink.includes("/search/")) return;
    if (!classifyPokemonPost(candidate.title, candidate.excerpt)) return;

    seenKeys.add(key);
    seenKeys.add(urlKey);
    rawThreads.push({
      ...candidate,
      id: key,
    });
  };

  // 1. Live ArcticShift real-time Reddit API scan across r/PokemonTCG, r/PKMNTCGDeals, r/PokeInvesting
  const arcticSubreddits = [
    { sub: "PokemonTCG", limit: 100 },
    { sub: "PKMNTCGDeals", limit: 45 },
    { sub: "PokeInvesting", limit: 45 },
  ];

  for (const { sub, limit } of arcticSubreddits) {
    try {
      const res = await fetch(
        `https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=${sub}&limit=${limit}`,
        { signal: AbortSignal.timeout(5500) },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Array<{
            id?: string;
            subreddit?: string;
            title?: string;
            selftext?: string;
            author?: string;
            permalink?: string;
            created_utc?: number;
            removed_by_category?: string | null;
          }>;
        };
        for (const post of json.data ?? []) {
          if (!post.id || !post.title || !post.permalink) continue;
          if (
            post.removed_by_category ||
            post.selftext === "[removed]" ||
            post.selftext === "[deleted]"
          ) {
            continue;
          }
          const cleanBody = (post.selftext || "")
            .replace(/https?:\/\/\S+/g, "")
            .replace(/\s+/g, " ")
            .trim();
          addCandidate({
            id: `t3_${post.id}`,
            subreddit: `r/${post.subreddit || sub}`,
            title: post.title.trim(),
            author: post.author ? `u/${post.author}` : "u/PokemonCollector",
            permalink: post.permalink.startsWith("http")
              ? post.permalink
              : `https://www.reddit.com${post.permalink}`,
            postedAt: post.created_utc
              ? new Date(post.created_utc * 1000).toISOString()
              : new Date().toISOString(),
            excerpt: (cleanBody || post.title).slice(0, 220),
          });
        }
      }
    } catch {
      // Continue to next source on timeout
    }
  }

  // 2. Live Reddit RSS feeds (secondary real-time source)
  for (const feed of REDDIT_RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": `desktop:com.packradar.radar:v2.4 (by /u/${REDDIT_USERNAME})`,
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const entries = xml.split("<entry>").slice(1);
      for (const entry of entries) {
        const idRaw = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? "";
        const titleRaw = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
        const title = decodeXmlEntities(titleRaw).trim();
        const linkMatch = entry.match(/<link[^>]+href="([^"]+)"/);
        const permalink = linkMatch ? decodeXmlEntities(linkMatch[1]) : "";
        const authorName =
          entry.match(/<name>([\s\S]*?)<\/name>/)?.[1]?.trim() ?? "u/PokemonCollector";
        const updated =
          entry.match(/<updated>([\s\S]*?)<\/updated>/)?.[1]?.trim() ?? new Date().toISOString();
        const contentRaw = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] ?? "";
        const excerpt = stripHtml(contentRaw)
          .replace(/submitted by\s+\/u\/\S+\s*\[link\]\s*\[comments\]/gi, "")
          .trim()
          .slice(0, 220);

        if (!title || !permalink.includes("/comments/")) continue;
        addCandidate({
          id: idRaw || permalink,
          subreddit: feed.subreddit,
          title,
          author: authorName.startsWith("/u/") ? authorName.slice(1) : authorName,
          permalink,
          postedAt: updated,
          excerpt: excerpt || title,
        });
      }
    } catch {
      // Ignore RSS timeout
    }
  }

  // 3. Merge curated verified daily Pokémon threads (excluding any commented/dismissed threads)
  for (const verified of CURATED_DAILY_POKEMON_THREADS) {
    addCandidate(verified);
  }

  // Balance categories so all 5 topics (news, restock, vending, scalpers, pulls) are well represented
  const byCategory: Record<RedditOpportunityCategory, typeof rawThreads> = {
    news: [],
    restock: [],
    vending: [],
    scalpers: [],
    pulls: [],
  };
  for (const item of rawThreads) {
    const cat = classifyPokemonPost(item.title, item.excerpt) ?? "pulls";
    byCategory[cat].push(item);
  }
  for (const cat of Object.keys(byCategory) as RedditOpportunityCategory[]) {
    byCategory[cat].sort(
      (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
    );
  }

  const balancedRaw = [
    ...byCategory.news.slice(0, 10),
    ...byCategory.restock.slice(0, 12),
    ...byCategory.vending.slice(0, 8),
    ...byCategory.scalpers.slice(0, 6),
    ...byCategory.pulls.slice(0, 6),
  ];

  const { activeClickedMap } = await getAndPruneClickedThreadMap(db);
  const opportunities: RedditOpportunity[] = [];
  for (const item of balancedRaw.slice(0, 40)) {
    const key = normalizeThreadKey(item.id);
    const urlKey = normalizeThreadKey(item.permalink);
    const prev = existingMap.get(key);
    if (prev && (prev.status === "replied" || prev.status === "dismissed")) {
      continue;
    }

    const clickedAt =
      activeClickedMap[key] ||
      activeClickedMap[urlKey] ||
      (prev?.status === "clicked" && prev.clickedAt ? prev.clickedAt : null);

    if (
      clickedAt &&
      Date.now() - new Date(clickedAt).getTime() >= CLICKED_HOLD_DURATION_MS
    ) {
      await markRedditThreadCommented(db, item.id, item.permalink);
      continue;
    }

    const drafted = await buildDataBackedRedditReply(db, {
      subreddit: item.subreddit,
      title: item.title,
      body: item.excerpt,
      permalink: item.permalink,
    });

    opportunities.push({
      id: item.id,
      subreddit: item.subreddit,
      title: item.title,
      author: item.author,
      permalink: item.permalink,
      postedAt: item.postedAt,
      excerpt: item.excerpt,
      category: drafted.category,
      matchedState: drafted.matchedState,
      matchedCity: drafted.matchedCity,
      matchedLocationLabel: drafted.matchedLocationLabel,
      matchedMachinesCount: drafted.matchedMachinesCount,
      targetPackRadarUrl: drafted.targetPackRadarUrl,
      helpfulReplyDraft: drafted.helpfulReplyDraft,
      shortReplyDraft: drafted.shortReplyDraft,
      altCleverDraft: drafted.altCleverDraft,
      newsDraft: drafted.newsDraft,
      dropsDraft: drafted.dropsDraft,
      vendingDraft: drafted.vendingDraft,
      status: clickedAt ? "clicked" : "open",
      clickedAt,
    });
  }

  const sortedOpportunities = sortOpportunitiesOpenFirst(opportunities);

  await db
    .insert(settings)
    .values({ key: "redditOpportunitiesV1", value: sortedOpportunities })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sortedOpportunities, updatedAt: new Date() },
    });

  return sortedOpportunities;
}

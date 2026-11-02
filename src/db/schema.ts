import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  real,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ───────────────────────────── Auth (Better Auth) ───────────────────────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  // PackRadar fields
  role: text("role").notNull().default("user"), // user | mod | admin
  reputation: integer("reputation").notNull().default(0),
  plan: text("plan").notNull().default("free"), // free | premium
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  homeZip: text("home_zip"),
  homeLat: doublePrecision("home_lat"),
  homeLng: doublePrecision("home_lng"),
  discordWebhookUrl: text("discord_webhook_url"),
  phone: text("phone"), // premium SMS (future)
  quietHoursStart: integer("quiet_hours_start"), // minute of day
  quietHoursEnd: integer("quiet_hours_end"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────────────────────── Machines & drop times ───────────────────────────── */

export const machines = pgTable(
  "machines",
  {
    id: text("id").primaryKey(), // official code (e.g. Q01168) or c-<uuid> for community-added
    officialId: text("official_id"), // locator record id
    code: text("code"), // e.g. Q01168
    retailer: text("retailer").notNull(),
    street: text("street").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    timezone: text("timezone").notNull(),
    citySlug: text("city_slug").notNull(),
    status: text("status").notNull().default("active"), // active | removed | broken | unverified
    source: text("source").notNull().default("official"), // official | community | seed
    // Denormalized active drop schedule (for fast map rendering)
    activeCandidateId: text("active_candidate_id"),
    intervalMinutes: integer("interval_minutes"),
    anchorMinute: integer("anchor_minute"),
    activeStartMinute: integer("active_start_minute").notNull().default(480), // 8:00 AM
    activeEndMinute: integer("active_end_minute").notNull().default(1320), // 10:00 PM
    daysMask: integer("days_mask").notNull().default(127),
    accuracy: real("accuracy"),
    scheduleSource: text("schedule_source"),
    scheduleVerified: boolean("schedule_verified").notNull().default(false),
    stockStatus: text("stock_status").notNull().default("unknown"), // unknown | stocked | low | empty
    stockUpdatedAt: timestamp("stock_updated_at", { withTimezone: true }),
    lastSeenOfficialAt: timestamp("last_seen_official_at", { withTimezone: true }),
    addedByUserId: text("added_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("machines_state_city_idx").on(t.state, t.citySlug),
    index("machines_lat_lng_idx").on(t.lat, t.lng),
    index("machines_zip_idx").on(t.zip),
  ],
);

export const dropCandidates = pgTable(
  "drop_candidates",
  {
    id: id(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    intervalMinutes: integer("interval_minutes").notNull(),
    anchorMinute: integer("anchor_minute").notNull(),
    activeStartMinute: integer("active_start_minute"),
    activeEndMinute: integer("active_end_minute"),
    daysMask: integer("days_mask"),
    source: text("source").notNull(), // official | scraped | community | observed | seed
    baseConfidence: real("base_confidence").notNull(),
    verified: boolean("verified").notNull().default(false),
    accuracy: real("accuracy").notNull().default(0),
    confirms: real("confirms").notNull().default(0),
    disputes: real("disputes").notNull().default(0),
    matchingObservations: integer("matching_observations").notNull().default(0),
    conflictingObservations: integer("conflicting_observations").notNull().default(0),
    supporters: integer("supporters").notNull().default(0),
    lastCorroboratedAt: timestamp("last_corroborated_at", { withTimezone: true }),
    sourceUrl: text("source_url"),
    sourceTitle: text("source_title"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    createdByUserId: text("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("drop_candidates_machine_idx").on(t.machineId)],
);

export const dropVotes = pgTable(
  "drop_votes",
  {
    id: id(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => dropCandidates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    value: integer("value").notNull(), // +1 confirm | -1 dispute
    weight: real("weight").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("drop_votes_candidate_user_uq").on(t.candidateId, t.userId)],
);

export const dropObservations = pgTable(
  "drop_observations",
  {
    id: id(),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull().default("dropped"), // dropped | no_drop
    matchedCandidateId: text("matched_candidate_id"),
    source: text("source").notNull().default("user"), // user | scraped
    sourceUrl: text("source_url"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("drop_obs_machine_idx").on(t.machineId, t.observedAt)],
);

export const scheduleHistory = pgTable("schedule_history", {
  id: id(),
  machineId: text("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "cascade" }),
  fromCandidateId: text("from_candidate_id"),
  toCandidateId: text("to_candidate_id"),
  fromDescription: text("from_description"),
  toDescription: text("to_description").notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

export const stockReports = pgTable("stock_reports", {
  id: id(),
  machineId: text("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  status: text("status").notNull(), // stocked | low | empty | broken | removed
  note: text("note"),
  createdAt: createdAt(),
});

export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    machineId: text("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.machineId] })],
);

/* ───────────────────────────── Alerts & notifications ───────────────────────────── */

export const alertSubscriptions = pgTable(
  "alert_subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // machine_drop | schedule_change | area_drop | product_restock | release | news
    kind: text("kind").notNull(),
    machineId: text("machine_id").references(() => machines.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    retailer: text("retailer"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    radiusMiles: real("radius_miles"),
    keyword: text("keyword"),
    leadMinutes: integer("lead_minutes").notNull().default(5),
    channels: jsonb("channels").$type<string[]>().notNull().default(["email", "push"]),
    maxPerDay: integer("max_per_day").notNull().default(6),
    windowStartMinute: integer("window_start_minute"), // only alert inside this local window
    windowEndMinute: integer("window_end_minute"),
    active: boolean("active").notNull().default(true),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("alert_subs_user_idx").on(t.userId), index("alert_subs_kind_idx").on(t.kind)],
);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id"),
    channel: text("channel").notNull(), // email | push | discord | sms | inapp
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    status: text("status").notNull().default("sent"), // sent | logged | failed
    error: text("error"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey, t.channel),
    index("notifications_user_idx").on(t.userId, t.createdAt),
  ],
);

/* ───────────────────────────── Products, releases, retail ───────────────────────────── */

export const releases = pgTable("releases", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("set"), // set | product | game | event
  releaseDate: text("release_date"), // YYYY-MM-DD
  preorderDate: text("preorder_date"),
  cardCount: integer("card_count"),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  description: text("description"),
  confirmed: boolean("confirmed").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const products = pgTable("products", {
  id: id(),
  name: text("name").notNull(),
  setName: text("set_name"),
  category: text("category").notNull().default("other"), // booster | etb | bundle | box | tin | collection | other
  msrp: real("msrp"),
  imageUrl: text("image_url"),
  releaseId: text("release_id"),
  createdAt: createdAt(),
});

export const retailListings = pgTable("retail_listings", {
  id: id(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  retailer: text("retailer").notNull(), // pokemon_center | target | walmart | bestbuy | gamestop | amazon
  url: text("url").notNull(),
  sku: text("sku"),
  inStock: boolean("in_stock"),
  price: real("price"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastInStockAt: timestamp("last_in_stock_at", { withTimezone: true }),
  lastChangeAt: timestamp("last_change_at", { withTimezone: true }),
  checkError: text("check_error"),
  affiliateUrl: text("affiliate_url"),
  createdAt: createdAt(),
});

/* ───────────────────────────── News & community ───────────────────────────── */

export const newsPosts = pgTable(
  "news_posts",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    body: text("body"), // markdown
    category: text("category").notNull().default("tcg"), // vending | drop-report | releases | tcg | games | anime | general
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    imageUrl: text("image_url"),
    author: text("author").notNull().default("PackRadar Bot"),
    autoGenerated: boolean("auto_generated").notNull().default(true),
    pinned: boolean("pinned").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("news_source_url_uq").on(t.sourceUrl),
    index("news_published_idx").on(t.publishedAt),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    targetType: text("target_type").notNull(), // machine | news
    targetId: text("target_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("comments_target_idx").on(t.targetType, t.targetId)],
);

export const reactions = pgTable(
  "reactions",
  {
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.targetType, t.targetId, t.userId, t.emoji] })],
);

export const activity = pgTable(
  "activity",
  {
    id: id(),
    type: text("type").notNull(), // drop_observed | vote | schedule_change | new_machine | stock | news | release | restock_online
    machineId: text("machine_id"),
    userId: text("user_id"),
    message: text("message").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

export const reputationEvents = pgTable("reputation_events", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

/* ───────────────────────────── Monetization ───────────────────────────── */

export const sponsors = pgTable("sponsors", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("local_vendor"), // local_vendor | affiliate | ad
  tagline: text("tagline"),
  url: text("url").notNull(),
  imageUrl: text("image_url"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  radiusMiles: real("radius_miles"),
  city: text("city"),
  state: text("state"),
  placement: text("placement").notNull().default("any"), // any | sidebar | feed | machine | banner
  priority: integer("priority").notNull().default(0),
  active: boolean("active").notNull().default(true),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: createdAt(),
});

/* ───────────────────────────── Ops ───────────────────────────── */

export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: id(),
    adapter: text("adapter").notNull(),
    status: text("status").notNull().default("running"), // running | success | partial | failed | skipped
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    itemsFound: integer("items_found").notNull().default(0),
    itemsCreated: integer("items_created").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    error: text("error"),
    log: text("log"),
  },
  (t) => [index("scrape_runs_adapter_idx").on(t.adapter, t.startedAt)],
);

export const zipCodes = pgTable("zip_codes", {
  zip: text("zip").primaryKey(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: updatedAt(),
});

export type Machine = typeof machines.$inferSelect;
export type DropCandidate = typeof dropCandidates.$inferSelect;
export type NewsPost = typeof newsPosts.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type Sponsor = typeof sponsors.$inferSelect;
export type User = typeof user.$inferSelect;

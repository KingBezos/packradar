CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"machine_id" text,
	"user_id" text,
	"message" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"machine_id" text,
	"product_id" text,
	"retailer" text,
	"lat" double precision,
	"lng" double precision,
	"radius_miles" real,
	"keyword" text,
	"lead_minutes" integer DEFAULT 5 NOT NULL,
	"channels" jsonb DEFAULT '["email","push"]'::jsonb NOT NULL,
	"max_per_day" integer DEFAULT 6 NOT NULL,
	"window_start_minute" integer,
	"window_end_minute" integer,
	"active" boolean DEFAULT true NOT NULL,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"interval_minutes" integer NOT NULL,
	"anchor_minute" integer NOT NULL,
	"active_start_minute" integer,
	"active_end_minute" integer,
	"days_mask" integer,
	"source" text NOT NULL,
	"base_confidence" real NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"accuracy" real DEFAULT 0 NOT NULL,
	"confirms" real DEFAULT 0 NOT NULL,
	"disputes" real DEFAULT 0 NOT NULL,
	"matching_observations" integer DEFAULT 0 NOT NULL,
	"conflicting_observations" integer DEFAULT 0 NOT NULL,
	"supporters" integer DEFAULT 0 NOT NULL,
	"last_corroborated_at" timestamp with time zone,
	"source_url" text,
	"source_title" text,
	"evidence" jsonb,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_observations" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"user_id" text,
	"observed_at" timestamp with time zone NOT NULL,
	"kind" text DEFAULT 'dropped' NOT NULL,
	"matched_candidate_id" text,
	"source" text DEFAULT 'user' NOT NULL,
	"source_url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" integer NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" text NOT NULL,
	"machine_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_machine_id_pk" PRIMARY KEY("user_id","machine_id")
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" text PRIMARY KEY NOT NULL,
	"official_id" text,
	"code" text,
	"retailer" text NOT NULL,
	"street" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"timezone" text NOT NULL,
	"city_slug" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'official' NOT NULL,
	"active_candidate_id" text,
	"interval_minutes" integer,
	"anchor_minute" integer,
	"active_start_minute" integer DEFAULT 480 NOT NULL,
	"active_end_minute" integer DEFAULT 1320 NOT NULL,
	"days_mask" integer DEFAULT 127 NOT NULL,
	"accuracy" real,
	"schedule_source" text,
	"schedule_verified" boolean DEFAULT false NOT NULL,
	"stock_status" text DEFAULT 'unknown' NOT NULL,
	"stock_updated_at" timestamp with time zone,
	"last_seen_official_at" timestamp with time zone,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text,
	"category" text DEFAULT 'tcg' NOT NULL,
	"source_name" text,
	"source_url" text,
	"image_url" text,
	"author" text DEFAULT 'PackRadar Bot' NOT NULL,
	"auto_generated" boolean DEFAULT true NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_posts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subscription_id" text,
	"channel" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"set_name" text,
	"category" text DEFAULT 'other' NOT NULL,
	"msrp" real,
	"image_url" text,
	"release_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_target_type_target_id_user_id_emoji_pk" PRIMARY KEY("target_type","target_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'set' NOT NULL,
	"release_date" text,
	"preorder_date" text,
	"card_count" integer,
	"image_url" text,
	"source_url" text,
	"source_name" text,
	"description" text,
	"confirmed" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retail_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"retailer" text NOT NULL,
	"url" text NOT NULL,
	"sku" text,
	"in_stock" boolean,
	"price" real,
	"last_checked_at" timestamp with time zone,
	"last_in_stock_at" timestamp with time zone,
	"last_change_at" timestamp with time zone,
	"check_error" text,
	"affiliate_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_history" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"from_candidate_id" text,
	"to_candidate_id" text,
	"from_description" text,
	"to_description" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"adapter" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"items_found" integer DEFAULT 0 NOT NULL,
	"items_created" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"error" text,
	"log" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'local_vendor' NOT NULL,
	"tagline" text,
	"url" text NOT NULL,
	"image_url" text,
	"lat" double precision,
	"lng" double precision,
	"radius_miles" real,
	"city" text,
	"state" text,
	"placement" text DEFAULT 'any' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"user_id" text,
	"status" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"reputation" integer DEFAULT 0 NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"stripe_customer_id" text,
	"home_zip" text,
	"home_lat" double precision,
	"home_lng" double precision,
	"discord_webhook_url" text,
	"phone" text,
	"quiet_hours_start" integer,
	"quiet_hours_end" integer,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zip_codes" (
	"zip" text PRIMARY KEY NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_subscriptions" ADD CONSTRAINT "alert_subscriptions_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_candidates" ADD CONSTRAINT "drop_candidates_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_observations" ADD CONSTRAINT "drop_observations_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_observations" ADD CONSTRAINT "drop_observations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_votes" ADD CONSTRAINT "drop_votes_candidate_id_drop_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."drop_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_votes" ADD CONSTRAINT "drop_votes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retail_listings" ADD CONSTRAINT "retail_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_history" ADD CONSTRAINT "schedule_history_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reports" ADD CONSTRAINT "stock_reports_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reports" ADD CONSTRAINT "stock_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "alert_subs_user_idx" ON "alert_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alert_subs_kind_idx" ON "alert_subscriptions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "comments_target_idx" ON "comments" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "drop_candidates_machine_idx" ON "drop_candidates" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "drop_obs_machine_idx" ON "drop_observations" USING btree ("machine_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "drop_votes_candidate_user_uq" ON "drop_votes" USING btree ("candidate_id","user_id");--> statement-breakpoint
CREATE INDEX "machines_state_city_idx" ON "machines" USING btree ("state","city_slug");--> statement-breakpoint
CREATE INDEX "machines_lat_lng_idx" ON "machines" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "machines_zip_idx" ON "machines" USING btree ("zip");--> statement-breakpoint
CREATE UNIQUE INDEX "news_source_url_uq" ON "news_posts" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "news_published_idx" ON "news_posts" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("dedupe_key","channel");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "scrape_runs_adapter_idx" ON "scrape_runs" USING btree ("adapter","started_at");
-- oxy:deploy-phase=pre
-- Directly sold ad campaigns: one creative per slot variant, served in its window.
CREATE TABLE "ad_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"advertiser_name" text NOT NULL,
	"advertiser_email" text NOT NULL,
	"image_url" text NOT NULL,
	"click_url" text NOT NULL,
	"variant" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_campaigns_id_format" CHECK ("ad_campaigns"."id" ~ '^[0-9a-f]{24}$'),
	CONSTRAINT "ad_campaigns_variant_check" CHECK ("ad_campaigns"."variant" IN ('leaderboard', 'mrec', 'inline')),
	CONSTRAINT "ad_campaigns_status_check" CHECK ("ad_campaigns"."status" IN ('active', 'paused', 'cancelled')),
	CONSTRAINT "ad_campaigns_window_check" CHECK ("ad_campaigns"."ends_at" > "ad_campaigns"."starts_at")
);
--> statement-breakpoint
CREATE INDEX "ad_campaigns_live_idx" ON "ad_campaigns" USING btree ("variant","created_at" DESC NULLS LAST) WHERE "ad_campaigns"."status" = 'active';--> statement-breakpoint
CREATE INDEX "ad_campaigns_status_created_at_idx" ON "ad_campaigns" USING btree ("status","created_at" DESC NULLS LAST);
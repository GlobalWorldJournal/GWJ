-- oxy:deploy-phase=pre
-- Most Popular views, upload renditions and newsroom roles. All additive for the running release.
CREATE TABLE "article_views_daily" (
	"article_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "article_views_daily_article_id_day_pk" PRIMARY KEY("article_id","day")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"url" text PRIMARY KEY NOT NULL,
	"sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "article_views_daily" ADD CONSTRAINT "article_views_daily_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_views_daily_day_idx" ON "article_views_daily" USING btree ("day");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('admin', 'editor'));